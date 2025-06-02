// Load environment variables first
require('dotenv').config();
const express            = require('express');
const fetch              = require('node-fetch');      // v2.x
// Bring in xml2js parseStringPromise
const { parseStringPromise } = require('xml2js');

const app = express();


// Enable CORS for all origins
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

/**
 * GET /api/metars?stations=OMDB,KDXB
 * Proxies the Aviation Weather Center Data API for METARs.
 */

app.get('/api/metars', async (req, res) => {
  const stations = req.query.stations || '';
  
  const lookback = req.query.hours || '2';
  const params   = new URLSearchParams({
    ids:    stations,
    hours:  lookback,
   format: 'json'
   });
  const apiUrl = `https://aviationweather.gov/api/data/metar?${params}`;

  try {
    // Spoof a browser User-Agent if needed
    const apiRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
                      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                      'Chrome/114.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!apiRes.ok) {
      console.error('Upstream error', apiRes.status, apiRes.statusText);
      return res
        .status(502)
        .json({ error: `Upstream METAR service responded with ${apiRes.status}` });
    }

    const json = await apiRes.json();
    return res.json(json);

  } catch (err) {
    console.error('Proxy error fetching METARs:', err);
    return res
      .status(502)
      .json({ error: 'Bad gateway fetching METARs' });
  }
});




// Start listening
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`METAR proxy listening on http://localhost:${PORT}`);
});



/**
 * GET /api/tafs?stations=OMDB,KJFK
 * Proxies the Aviation Weather Center Data API for TAFs.
 */
app.get('/api/tafs', async (req, res) => {
    const stations = req.query.stations || '';
    const params   = new URLSearchParams({
      ids:    stations,
      format: 'json'
    });
    const apiUrl = `https://aviationweather.gov/api/data/taf?${params}`;
  
    try {
      const apiRes = await fetch(apiUrl, {
       // headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
       headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
                      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                      'Chrome/114.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
      });
      if (!apiRes.ok) {
        console.error('TAF upstream error', apiRes.status, apiRes.statusText);
        return res
          .status(502)
          .json({ error: `Upstream TAF service responded with ${apiRes.status}` });
      }
      const json = await apiRes.json();
      res.json(json);
    } catch (err) {
      console.error('Proxy error fetching TAFs:', err);
      res.status(502).json({ error: 'Bad gateway fetching TAFs' });
    }
  });
  
  //NOTAMS CHNAGES
  // NEW: /api/notams
  app.get('/api/notams', async (req, res) => {
    const station = (req.query.stations||'').toUpperCase();
    if (!station) return res.status(400).json({error:'Missing ?stations='});
  
    console.log('→ /api/notams for', station);
  
    const soap = `<?xml version="1.0"?>  
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                      xmlns:wfs="http://www.opengis.net/wfs"
                      xmlns:ogc="http://www.opengis.net/ogc"
                      xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <soapenv:Header>
        <wsse:Security soapenv:mustUnderstand="1">
          <wsse:UsernameToken>
            <wsse:Username>${process.env.FAA_USER}</wsse:Username>
            <wsse:Password>${process.env.FAA_PASS}</wsse:Password>
          </wsse:UsernameToken>
        </wsse:Security>
      </soapenv:Header>
      <soapenv:Body>
        <wfs:GetFeature service="WFS" version="1.0.0">
          <wfs:Query typeName="notam:NOTAM">
            <ogc:Filter>
              <ogc:PropertyIsEqualTo>
                <ogc:PropertyName>ICAO3D</ogc:PropertyName>
                <ogc:Literal>${station}</ogc:Literal>
              </ogc:PropertyIsEqualTo>
            </ogc:Filter>
          </wfs:Query>
        </wfs:GetFeature>
      </soapenv:Body>
    </soapenv:Envelope>`;
  
    try {
      const response = await fetch(
        'https://notams.aim.faa.gov/notamWFS?service=WFS&version=1.0.0&request=GetFeature',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction':    'GetFeature'
          },
          body: soap
        }
      );
      if (!response.ok) throw new Error(`FAA WFS ${response.status}`);
      const xml  = await response.text();
      const js   = await parseStringPromise(xml, { explicitArray:false });
      const members = js['soapenv:Envelope']
                       ['soapenv:Body']
                       ['wfs:FeatureCollection']
                       ['gml:featureMember'];
      const notams = Array.isArray(members)
        ? members.map(m=>m.NOTAM)
        : [members.NOTAM];
      return res.json(notams);
  
    } catch (err) {
      console.error('FAA NOTAM error:', err);
      return res.status(502).json({ error: err.message });
    }
  });
  
  
  //app.listen(PORT, ()=>console.log(`METAR proxy listening on http://localhost:${PORT}`));
// server.js


  