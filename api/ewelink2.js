const eWeLink = require('ewelink-api-next');
const { kv } = require('@vercel/kv');

const {
  EWELINK_EMAIL,
  EWELINK_PASSWORD,
  EWELINK_APPID,
  EWELINK_APP_SECRET,
  EWELINK_REGION,
  EWELINK_IOTKEY,
} = process.env;
const client = new eWeLink.WebAPI({
  appId: EWELINK_APPID,
  appSecret: EWELINK_APP_SECRET,
  region: EWELINK_REGION,
});

let ACCESS_TOKEN;
let REFRESH_TOKEN;
const redirectUrl = 'https://httpbin.org/get';
async function initClient() {
  if (ACCESS_TOKEN && REFRESH_TOKEN) {
    client.at = ACCESS_TOKEN;
    client.rt = REFRESH_TOKEN;
    return;
  }
  const accessTokenKV = await kv.get('EWE_ACCESS_TOKEN');
  const refreshTokenKV = await kv.get('EWE_REFRESH_TOKEN');
  if (accessTokenKV && refreshTokenKV) {
    ACCESS_TOKEN = accessTokenKV;
    REFRESH_TOKEN = refreshTokenKV;
    client.at = ACCESS_TOKEN;
    client.rt = REFRESH_TOKEN;
    return;
  }

  const url = await client.oauth.createLoginUrl({
    redirectUrl,
    state: '001',
  });

  const _URL = new URL(url);
  const authorizationCode = _URL.searchParams
    .get('authorization')
    .replace(/ /g, '+');
  const payload = {
    authorization: `Sign ${authorizationCode}`,
    clientId: _URL.searchParams.get('clientId'),
    email: EWELINK_EMAIL,
    grantType: 'authorization_code',
    nonce: _URL.searchParams.get('nonce'),
    password: EWELINK_PASSWORD,
    redirectUrl: _URL.searchParams.get('redirectUrl'),
    seq: _URL.searchParams.get('seq'),
    state: _URL.searchParams.get('state'),
  };

  // POST https://apia.coolkit.cn/v2/user/oauth/code
  const codeRes = await fetch('https://apia.coolkit.cn/v2/user/oauth/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ck-Appid': EWELINK_APPID,
      'X-Ck-Nonce': payload.nonce,
      'X-Ck-Seq': payload.seq,
      Authorization: `Sign ${authorizationCode}`,
    },
    body: JSON.stringify(payload),
  }).then((r) => r.json());

  const response = await client.oauth.getToken({
    region: EWELINK_REGION,
    redirectUrl: 'https://httpbin.org/get',
    code: codeRes.data.code,
  });

  const {
    data: { accessToken, refreshToken },
  } = response;

  client.at = accessToken;
  client.rt = refreshToken;

  ACCESS_TOKEN = accessToken;
  REFRESH_TOKEN = refreshToken;
  kv.set('EWE_ACCESS_TOKEN', accessToken);
  kv.set('EWE_REFRESH_TOKEN', refreshToken);
}

module.exports = async (req, res) => {
  const {
    query: { deviceName, deviceState, key },
  } = req;
  if (!deviceName || !deviceState) {
    res.json({ error: 'deviceName and deviceState are required.' });
    return;
  }

  if (key !== EWELINK_IOTKEY) {
    res.json({ error: 'key is required.' });
    return;
  }

  await initClient();

  const things = await client.device.getAllThings();
  const thing = things.data.thingList.find(
    (t) => t.itemData.name.toLowerCase() === deviceName.trim().toLowerCase(),
  );
  if (!thing) {
    res.json({ error: `Thing "${deviceName}" not found.` });
    return;
  }

  const status = await client.device.setThingStatus({
    type: thing.itemType,
    id: thing.itemData.deviceid,
    params: {
      switches: [
        {
          outlet: 0,
          switch: deviceState,
        },
      ],
    },
  });

  res.json(status);
};
