const storage = require('../storage');
const mozlog = require('../log');
const log = mozlog('send.download');
const crypto = require('crypto');

function validateID(route_id) {
  return route_id.match(/^[0-9a-fA-F]{10}$/) !== null;
}

module.exports = async function(req, res) {
  const id = req.params.id;
  if (!validateID(id)) {
    return res.sendStatus(404);
  }

  try {
    const auth = req.header('Authorization').split(' ')[1];
    const meta = await storage.metadata(id);
    const hmac = crypto.createHmac('sha256', Buffer.from(meta.auth, 'base64'));
    hmac.update(Buffer.from(meta.nonce, 'base64'));
    const verifyHash = hmac.digest();
    const nonce = crypto.randomBytes(16).toString('base64');
    storage.setField(id, 'nonce', nonce);
    if (!verifyHash.equals(Buffer.from(auth, 'base64'))) {
      res.set('WWW-Authenticate', `send-v1 ${nonce}`);
      return res.sendStatus(401);
    }
    const contentLength = await storage.length(id);
    res.writeHead(200, {
      'Content-Disposition': 'attachment',
      'Content-Type': 'application/octet-stream',
      'Content-Length': contentLength,
      'X-File-Metadata': meta.metadata,
      'WWW-Authenticate': `send-v1 ${nonce}`
    });
    const file_stream = storage.get(id);

    file_stream.on('end', async () => {
      try {
        await storage.forceDelete(id);
      } catch (e) {
        log.info('DeleteError:', id);
      }
    });

    file_stream.pipe(res);
  } catch (e) {
    res.sendStatus(404);
  }
};
