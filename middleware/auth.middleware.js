import jwt from 'jsonwebtoken';

export const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const verifyLicenseToken = (req, res, next) => {
  try {
    const licenseToken = req.headers['x-license-token'];

    if (!licenseToken) {
      return res.status(401).json({ error: 'No license token provided' });
    }

    const decoded = jwt.verify(licenseToken, process.env.JWT_SECRET);

    // Verify asset ID matches
    if (decoded.assetId !== req.params.assetId) {
      return res.status(403).json({ error: 'Asset ID mismatch' });
    }

    req.licenseData = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid license token' });
  }
};
