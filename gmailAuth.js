const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const airportData = require('./airports.json');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = 'token.json';

function authorize(callback) {
  const credentials = JSON.parse(fs.readFileSync('credentials.json'));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    callback(oAuth2Client);
  } else {
    const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
    console.log('Authorize this app by visiting this URL:\n', authUrl);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Enter the code from the page: ', code => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.error('Error retrieving token', err);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        oAuth2Client.setCredentials(token);
        callback(oAuth2Client);
      });
    });
  }
}

function fetchLatestMetarFromGmail(station, callback) {
    authorize(auth => {
      const gmail = google.gmail({ version: 'v1', auth });
  
      // BROADER SUBJECT MATCH based on your inbox
      gmail.users.messages.list({
        userId: 'me',
      //  q: `subject:METAR ${station}`,  // Removed 'newer_than' to increase catch
      q: `${station}`,
      
      maxResults: 5
      
      }, async (err, res) => {
        if (err) return callback(err);
  
        const messages = res.data.messages || [];
      if (!messages.length) return callback(null, null);

      // Load all matching messages
      for (const message of messages) {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });
        console.log("station requesing from gmail is:", station);
        const snippet = msg.data.snippet;
        console.log("📬 Checking message:", snippet);

        // Extract METAR line
      //  const regex = new RegExp(`METAR\\s+${station}\\s+\\d{6}Z\\s+[^=]+`);
      const regex = new RegExp(`METAR\\s+${station}\\s+\\d{6}Z\\s+[^=\\n]+`, 'i');
      console.log("regex framed ",regex);
      const metarLine = snippet.match(regex);
        if (metarLine) {
            if (station.toUpperCase() === 'HDAM' || station.toUpperCase() === 'JIB') {
                return callback(null, {
                  raw_text: metarLine[0].trim(),
                  icaoId: 'HDAM',
                  receiptTime: new Date().toISOString(),
                  name: 'Djibouti/Ambouli Intl, DJ'
                });
              }
              if (station.toUpperCase() === 'OAKB' || station.toUpperCase() === 'KBL') {
                return callback(null, {
                  raw_text: metarLine[0].trim(),
                  icaoId: 'OAKB',
                  receiptTime: new Date().toISOString(),
                  name: 'Kabul Intl, AF'
                });
              }
            // ✅ Add station name from airports.json
            const info = airportData[station.toUpperCase()];
            const stationName = info ? `${info.name}, ${info.ctry}` : "Fallback (Gmail)";
  
            return callback(null, {
              raw_text: metarLine[0].trim(),
              icaoId: station.toUpperCase(),
              receiptTime: new Date().toISOString(),
              name: stationName
            });
          }
        }

      // If none matched
      callback(null, null);
    });
  });
}
function fetchLatestTafFromGmail(station, callback) {
    authorize(auth => {
      const gmail = google.gmail({ version: 'v1', auth });
  
      gmail.users.messages.list({
        userId: 'me',
        q: `subject:TAF ${station}`,
        maxResults: 5
      }, async (err, res) => {
        if (err) return callback(err);
  
        const messages = res.data.messages || [];
        if (!messages.length) return callback(null, null);
  
        for (const message of messages) {
          const msg = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });
  
          const snippet = msg.data.snippet;
          console.log("📬 TAF snippet from Gmail:", snippet);
  
          // Match TAF string: e.g., "TAF HDAM 040500Z ..."
         // const regex = new RegExp(`TAF\\s+${station}\\s+\\d{6}Z\\s+.+`);
         const regex = new RegExp(`TAF\\s+${station}\\s+\\d{6}Z\\s+\\d{4}/\\d{4}\\s+.+`, 'i');
 
         const tafMatch = snippet.match(regex);
  
          if (tafMatch) {
            if (station.toUpperCase() === 'HDAM' || station.toUpperCase() === 'JIB') {
                return callback(null, {
                  raw_text: tafMatch[0].trim(),
                  icaoId: 'HDAM',
                  receiptTime: new Date().toISOString(),
                  name: 'Djibouti/Ambouli Intl, DJ'
                });
              }
              if (station.toUpperCase() === 'OAKB' || station.toUpperCase() === 'KBL') {
                return callback(null, {
                  raw_text: tafMatch[0].trim(),
                  icaoId: 'OAKB',
                  receiptTime: new Date().toISOString(),
                  name: 'Kabul Intl, AF'
                });
              }
            const info = airportData[station.toUpperCase()];
            const stationName = info ? `${info.name}, ${info.ctry}` : "Fallback (Gmail)";
  
           // return callback(null, tafMatch[0].trim());
           return callback(null, {
            raw_text: tafMatch[0].trim(),

            icaoId: station,
            receiptTime: new Date().toISOString(),
            name: stationName
          });
          
          }
        }
  
        callback(null, null); // No match found
      });
    });
  }
  
  module.exports = {
    fetchLatestMetarFromGmail,
    fetchLatestTafFromGmail
  };
  
