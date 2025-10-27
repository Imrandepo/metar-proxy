const { fetchLatestMetarFromGmail } = require('./gmailAuth');
const { fetchLatestTafFromGmail } = require('./gmailAuth');
// Load environment variables first
require('dotenv').config();
const express            = require('express');
const fetch              = require('node-fetch');      // v2.x

const app = express();
app.use(express.json());
//authentication
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/user');

const cors = require('cors');
app.use(cors({
  origin: '*',  // or restrict to specific origins later
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// server.js (add near top)

const { JSDOM } = require('jsdom');




// Enable CORS for all origins
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

/**
 * GET /api/metars?stations=OMDB,KDXB
 * Proxies the Aviation Weather Center Data API for METARs.
 */

/* Mango DB connecyion */
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));



// This metar fn is to work with multiple stations, combinations of aviweathe, gmail, mesonet 
app.get('/api/metars', async (req, res) => {
  const stations =(req.query.stations || '').split(',').map(s => s.trim().toUpperCase());
  const lookback = req.query.hours || '2';
 
  const results = [];

  for (const station of stations) 
    {
        let metarData = [];
        try {
            const params = new URLSearchParams({
              ids: station,
              hours: lookback,
              format: 'json'
            });

            const apiUrl = `https://aviationweather.gov/api/data/metar?${params}`;

  
            const apiRes = await fetch(apiUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
                              'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                              'Chrome/114.0.0.0 Safari/537.36',
                'Accept': 'application/json'
              }
            });

            const json = await apiRes.json();
            let metars = Array.isArray(json.data) ? json.data : json;
            
            if (metars.length) {
              results.push(...metars);
              continue;
            }
          } catch (e) {
            console.warn(`❌ Aviationweather fetch failed for ${station}`, e.message);
        }
         // 2. Try Mesonet

        try{  
              const now = new Date();
              const endDate = now.toISOString().slice(0, 10);
              const start = new Date(now.getTime() - lookback * 60 * 60 * 1000);
              const startDate = start.toISOString().slice(0, 10);

              const fallbackUrl = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${stations}&data=metar&year1=${startDate.slice(0,4)}&month1=${startDate.slice(5,7)}&day1=${startDate.slice(8,10)}&year2=${endDate.slice(0,4)}&month2=${endDate.slice(5,7)}&day2=${endDate.slice(8,10)}&tz=UTC&format=onlycomma&latlon=yes&missing=null&trace=null`;

              const fallbackRes = await fetch(fallbackUrl);
              const text = await fallbackRes.text();

              const lines = text.split('\n').filter(l => l.includes(station));
              const cutoff = new Date(Date.now() - lookback * 60 * 60 * 1000);

              let allMetars = lines.map(line => {
                const parts = line.split(',');
                const metarString = parts[4] || line;

              const match = metarString.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
              let obsDate = new Date();

              if (match) {
                const [, dd, hh, mm] = match.map(Number);
                const now = new Date();
                const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dd, hh, mm));
                const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, dd, hh, mm));
                obsDate = thisMonth <= now ? thisMonth : lastMonth;
              }

              return {
                raw_text: metarString,
                icaoId: stations.toUpperCase(),
                receiptTime: obsDate.toISOString(),
                name: "Fallback (Iowa)"
              };
            });

            const recent = allMetars.filter(m => new Date(m.receiptTime) >= cutoff);
            metars = recent.length > 0 ? recent : allMetars;
            if (allMetars.length) {
              results.push(...allMetars);
              continue;
            }
          } catch (e) {
            console.warn(`❌ Mesonet fallback failed for ${station}`, e.message);
        }
          
          
        // 3. Gmail fallback
        try {
              console.warn(`📩 Trying Gmail fallback for ${station}...`);
              await new Promise((resolve) => {
               fetchLatestMetarFromGmail(station.toUpperCase(), (err, metarObj) => {
                if (!err && metarObj) results.push(metarObj);
                resolve(); // Always resolve
              });
                          
            });
          } catch (e) {
            console.error(`📭 Gmail fallback failed for ${station}:`, e.message);
          }
    }
      
            if (results.length > 0) {
              return res.json(results);
            } else {
              return res.status(404).json({ error: 'No METARs found from any source.' });
            }
});




// This taf function for multiple stations fallbacks

app.get('/api/tafs', async (req, res) => {
  const stations = req.query.stations || '';
  const stationList = stations.toUpperCase().split(',').map(s => s.trim()).filter(Boolean);

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

        const json = await apiRes.json();  
        let tafs = Array.isArray(json.data) ? json.data : json;
        const finalTafs = [];
  
     for (const station of stationList) {
      const matching = tafs.filter(t =>
        (t.icaoId || t.station_id || '').toUpperCase() === station &&
        (
          (typeof t.rawTAF === 'string' && t.rawTAF.trim().length > 10) ||
          (typeof t.raw_text === 'string' && t.raw_text.trim().length > 10) ||
          (Array.isArray(t.fcsts) && t.fcsts.length > 0)
        )
      );
      
      if (matching.length > 0) {
        finalTafs.push(...matching);
      } else {
        console.warn(`📩 TAF not found for ${station}, trying Gmail fallback...`);
        const tafObj = await new Promise(resolve =>
          fetchLatestTafFromGmail(station, (err, result) => resolve(err || !result ? null : result))
        );
        if (tafObj) finalTafs.push(tafObj);
      }
    }

    if (finalTafs.length > 0) {
      return res.json(finalTafs);
    } else {
      return res.status(404).json({ error: 'No TAFs available from aviationweather or Gmail.' });
    }

  } catch (err) {
    console.error('Proxy error fetching TAFs:', err);
    return res.status(502).json({ error: 'Bad gateway fetching TAFs' });
  }
});



//adding mesonet link at the backend
const MESONET_BASE = process.env.MESONET_BASE_URL;

// e.g. MESONET_BASE=https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py
app.get('/api/asos', async (req, res) => {
  try {
    const { station, start, end } = req.query;
    // parse ISO dates back into year/month/day
    const s = new Date(start);
    const e = new Date(end);

    // build the real Mesonet URL
    const url = `${MESONET_BASE}`
      + `?station=${station}&data=metar`
      + `&year1=${s.getUTCFullYear()}`
      + `&month1=${String(s.getUTCMonth()+1).padStart(2,'0')}`
      + `&day1=${String(s.getUTCDate()).padStart(2,'0')}`
      + `&year2=${e.getUTCFullYear()}`
      + `&month2=${String(e.getUTCMonth()+1).padStart(2,'0')}`
      + `&day2=${String(e.getUTCDate()).padStart(2,'0')}`
      + `&tz=UTC&format=onlycomma&latlon=yes&missing=null&trace=null`;

    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).send(upstream.statusText);
    const text = await upstream.text();
    res.type('text/plain').send(text);

  } catch (err) {
    console.error('ASOS proxy error:', err);
    res.status(500).send('Server error');
  }
});


// Only team leads can open the Workload page
//const WORKLOAD_ALLOWED = new Set(['Aleksandr','Rahul.Yadav','Anton.Rajesh','Mohd.Ahsan','Rahul.Khurshid','admin']);

function authFor(audExpected) {
  return (req, res, next) => {
    const hdr = req.headers.authorization || '';
    const [type, token] = hdr.split(' ');
    if (type !== 'Bearer' || !token) {
      return res.status(401).json({ ok:false, error:'missing_token' });
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET); // { username, aud }
      if (payload.aud !== audExpected) {
        return res.status(403).json({ ok:false, error:'wrong_audience' });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ ok:false, error:'invalid_token' });
    }
  };
}

// Exact usernames allowed to access the Workload page
const WORKLOAD_ALLOWED = new Set([
  'Aleksandr.Beliakov',
  'Rahul.Yadav',
  'Anton.Rajiahh',
  'Muhammad.Ahsan',
  'Rahil.Khurshid',
  'admin',
  'teamlead'
]);

// 3) login endpoints
// index gate
app.get('/api/index/allow', authFor('index'), (req, res) => {
  res.json({ ok: true, user: req.user.username });
});

// workload gate
app.get('/api/products/workload/allow', authFor('workload'), (req, res) => {
  res.json({ ok: true, user: req.user.username });
});


app.post('/api/login-index', async (req, res) => {
  const { username, password } = req.body;
  if (username !== 'flightdispatch') {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ username, aud: 'index' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});


app.post('/api/login-workload', async (req, res) => {
  const { username, password } = req.body;

  if (!WORKLOAD_ALLOWED.has(username)) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ username, aud: 'workload' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`METAR proxy listening on http://localhost:${PORT}`);
});

//DB connection for authentication
// Register (only if you want user sign-up)
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const newUser = await User.create({ username, password: hashed });
    res.status(201).json({ message: 'User created' });
  } catch (err) {
    res.status(400).json({ error: 'User already exists or bad request' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

app.post('/api/change-password', async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Incorrect old password' });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('❌ Error changing password:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


