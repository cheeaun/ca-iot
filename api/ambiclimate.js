const got = require('got');
const FormData = require('form-data');
const { CookieJar } = require('tough-cookie');
const cookieJar = new CookieJar();
const { kv } = require('@vercel/kv');

const {
  AMBICLIMATE_CLIENT_ID,
  AMBICLIMATE_CLIENT_SECRET,
  AMBICLIMATE_USERNAME,
  AMBICLIMATE_PASSWORD,
  AMBICLIMATE_IOTKEY,
} = process.env;

const httpbinURL = 'https://httpbin.org/get';

let ACCESS_TOKEN;
const getAccessToken = async () => {
  if (ACCESS_TOKEN) return ACCESS_TOKEN;
  const accessTokenKV = await kv.get('ACCESS_TOKEN');
  if (accessTokenKV) {
    ACCESS_TOKEN = accessTokenKV;
    return accessTokenKV;
  }

  const authURL = `https://api.ambiclimate.com/oauth2/authorize?client_id=${AMBICLIMATE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    httpbinURL,
  )}&response_type=code`;
  console.log(`↗️ ${authURL}`);
  const response = await got(authURL, { followRedirect: false, cookieJar });

  const showLoginForm = /action="\/login/i.test(response.body);
  if (showLoginForm) {
    const form = new FormData();
    form.append('email', AMBICLIMATE_USERNAME);
    form.append('password', AMBICLIMATE_PASSWORD);
    const loginURL = `https://api.ambiclimate.com/login?next=${authURL}`;
    console.log(`↗️ ${loginURL}`);
    const response = await got.post(loginURL, {
      body: form,
      followRedirect: false,
      cookieJar,
    });
    if (response.statusCode !== 302) {
      throw new Error('Login failed');
    }
  }

  const form = new FormData();
  form.append('client_id', AMBICLIMATE_CLIENT_ID);
  form.append('scope', 'email device_read ac_control');
  form.append('response_type', 'code');
  form.append('redirect_uri', httpbinURL);
  form.append('confirm', 'yes');
  const authPostURL = `https://api.ambiclimate.com/oauth2/authorize`;
  console.log(`↗️ ${authPostURL}`);
  const response2 = await got.post(authPostURL, {
    body: form,
    followRedirect: false,
    cookieJar,
  });

  if (response2.headers.location) {
    const binURL = response2.headers.location;
    const response = await got(binURL).json();
    const { code } = response.args;

    if (code) {
      const getTokenURl = `https://api.ambiclimate.com/oauth2/token?client_id=${AMBICLIMATE_CLIENT_ID}&redirect_uri=${httpbinURL}&code=${code}&client_secret=${AMBICLIMATE_CLIENT_SECRET}&grant_type=authorization_code`;
      console.log(`↗️ ${getTokenURl}`);
      const response = await got(getTokenURl).json();

      const { access_token } = response;
      if (access_token) {
        ACCESS_TOKEN = access_token;
        kv.set('ACCESS_TOKEN', access_token);
        return access_token;
      } else {
        throw new Error('No access token');
      }
    } else {
      throw new Error('No code');
    }
  } else {
    throw new Error('Bin URL redirection failed');
  }
};

const fetchAC = async (path, query = {}) => {
  const accessToken = await getAccessToken();
  const apiURL = `https://api.ambiclimate.com/api/v1/${path}`;
  console.log(`↗️ ${apiURL}`);
  let response;
  try {
    response = await got(apiURL, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      searchParams: query,
      timeout: {
        request: 3000,
      },
    }).json();
  } catch (error) {
    if (/401/.test(error.message)) {
      ACCESS_TOKEN = null;
      await kv.del('ACCESS_TOKEN');
      return fetchAC(path, query);
    }
    throw error;
  }
  return response;
};

/*
LIST OF PATHS
- devices
- device/power/off
- device/mode/comfort
- user/feedback - value: too_hot | too_warm | bit_warm | comfortable | bit_cold | too_cold | freezing
- device/mode
- device/appliance_states
*/

module.exports = async (req, res) => {
  const { query } = req;
  const { path, command, __key, ...restQuery } = query;

  if (__key !== AMBICLIMATE_IOTKEY) {
    res.json({ error: 'key is required.' });
    return;
  }

  if (command === 'toggle') {
    console.log(`🗡️ Command: ${command}`);
    try {
      const data = await fetchAC('device/appliance_states');
      let power = 'on';
      if (data.data[0].power === 'On') {
        await fetchAC('device/power/off');
        power = 'Off';
      } else {
        await fetchAC('device/mode/comfort');
        power = 'On';
      }
      res.json({
        success: true,
        power,
      });
    } catch (error) {
      console.error(error);
      res.json({ error: error.message });
    }
    return;
  }

  console.log(`🏃 ${path} - ${JSON.stringify(restQuery)}`);
  try {
    const json = await fetchAC(path, restQuery);
    res.json(json);
  } catch (error) {
    console.error(error);
    res.json({ error: error.message });
  }
};
