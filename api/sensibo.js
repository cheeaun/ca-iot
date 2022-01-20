const got = require('got');

const { SENSIBO_APIKEY, SENSIBO_IOTKEY } = process.env;

const ROOT = 'https://home.sensibo.com/api/v2';

const fetchAC = async (path, opts) => {
  return got(`${ROOT}/${path}`, {
    searchParams: {
      apiKey: SENSIBO_APIKEY,
    },
    ...opts,
  }).json();
};

let pod;
module.exports = async (req, res) => {
  const { query } = req;
  const { command, __key } = query;

  if (__key !== SENSIBO_IOTKEY) {
    res.json({ error: 'key is required.' });
    return;
  }

  console.log(`🗡️ Command: ${command}`);

  // Get pods
  if (!pod) {
    try {
      const response = await fetchAC('/users/me/pods');
      pod = response.result[0];
    } catch (error) {
      console.error(error);
      res.json({ error: error.message });
      return;
    }
  }

  try {
    let json = {};
    if (command === 'toggle') {
      const response = await fetchAC(`/pods/${pod.id}/acStates`);
      const latestState = response.result[0];
      const {
        acState: { on },
      } = latestState;
      json = await fetchAC(`/pods/${pod.id}/acStates/on`, {
        method: 'patch',
        json: {
          newValue: !on,
        },
      });
    } else if (command === 'on') {
      json = await fetchAC(`/pods/${pod.id}/acStates/on`, {
        method: 'patch',
        json: {
          newValue: true,
        },
      });
    } else if (command === 'off') {
      json = await fetchAC(`/pods/${pod.id}/acStates/on`, {
        method: 'patch',
        json: {
          newValue: false,
        },
      });
    }
    res.json(json);
  } catch (error) {
    console.error(error);
    res.json({ error: error.message });
  }
};
