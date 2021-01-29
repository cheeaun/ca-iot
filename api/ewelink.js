const ewelink = require('ewelink-api');

const {
  EWELINK_EMAIL,
  EWELINK_PASSWORD,
  EWELINK_REGION,
  EWELINK_IOTKEY,
} = process.env;
const connection = new ewelink({
  email: EWELINK_EMAIL,
  password: EWELINK_PASSWORD,
  region: EWELINK_REGION,
});

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

  const devices = await connection.getDevices();

  const device = devices.find(
    (d) => d.name.trim().toLowerCase() === deviceName.trim().toLowerCase(),
  );
  if (!device) {
    res.json({ error: `Device "${deviceName}" not found.` });
    return;
  }

  const status = await connection.setDevicePowerState(
    device.deviceid,
    deviceState,
  );

  res.json(status);
};
