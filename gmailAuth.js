const express = require('express');
const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const airportData = require('./airports.json');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = 'token.json';

function authorize(callback) {
  const rawCreds = JSON.parse(fs.readFileSync('credentials.json'));
  const creds = rawCreds.installed || rawCreds.web;
  const { client_id, client_secret, redirect_uris } = creds;
  const redirectUri = redirect_uris[0];

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return callback(oAuth2Client);
  }

  const app = express();

  app.get('/oauth2callback', (req, res) => {
    const code = req.query.code;
    oAuth2Client.getToken(code, (err, token) => {
      if (err) {
        console.error('❌ Error retrieving token', err);
        return res.send('Auth failed. Check console.');
      }
      oAuth2Client.setCredentials(token);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
      res.send('✅ Authorization successful! You can close this tab.');
      server.close();
      callback(oAuth2Client);
    });
  });

  const server = app.listen(3000, () => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
    console.log('\n🌐 Please open the following URL in your browser to authorize the app:\n');
    console.log(authUrl);
    console.log('\nAfter logging in and granting access, come back here.\n');
  });
}

function fetchLatestMetarFromGmail(station, callback) {
  authorize(auth => {
    const gmail = google.gmail({ version: 'v1', auth });

    gmail.users.messages.list({
      userId: 'me',
      q: `${station}`,
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
        const regex = new RegExp(`METAR\\s+${station}\\s+\\d{6}Z\\s+[^=\\n]+`, 'i');
        const metarLine = snippet.match(regex);
      /*  if (metarLine) {
          const info = airportData[station.toUpperCase()];
          const stationName = info ? `${info.name}, ${info.ctry}` : "Fallback (Gmail)";
          return callback(null, {
            raw_text: metarLine[0].trim(),
            icaoId: station.toUpperCase(),
            receiptTime: new Date().toISOString(),
            name: stationName
          });
        }*/

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
        const regex = new RegExp(`TAF\\s+${station}\\s+\\d{6}Z\\s+\\d{4}/\\d{4}\\s+.+`, 'i');
        const tafMatch = snippet.match(regex);

    /*    if (tafMatch) {
          const info = airportData[station.toUpperCase()];
          const stationName = info ? `${info.name}, ${info.ctry}` : "Fallback (Gmail)";
          return callback(null, {
            raw_text: tafMatch[0].trim(),
            icaoId: station,
            receiptTime: new Date().toISOString(),
            name: stationName
          });
        }*/
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

      callback(null, null);
    });
  });
}

module.exports = {
  authorize,
  fetchLatestMetarFromGmail,
  fetchLatestTafFromGmail
};
