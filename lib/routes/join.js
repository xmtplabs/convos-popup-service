import { Router } from 'express';
import { verifyJoinToken } from '../auth/tokens.js';
import { generateQrSvg } from '../utils/qrcode.js';

export function joinRoutes(config, storage) {
  const router = Router();

  // GET /join/:namespace/:joinToken — QR code page
  router.get('/join/:namespace/:joinToken', async (req, res, next) => {
    try {
      const jti = req.params.joinToken;
      const signedToken = req.query.t;

      if (!signedToken) {
        return res.status(400).render('error', {
          title: 'Invalid Link',
          message: 'This link is missing required parameters.',
        });
      }

      // Verify the signed JWT
      let payload;
      try {
        payload = await verifyJoinToken(config, signedToken);
      } catch {
        return res.status(403).render('error', {
          title: 'Link Expired',
          message: 'This link has expired or is invalid.',
        });
      }

      // Check JTI matches path
      if (payload.jti !== jti) {
        return res.status(403).render('error', {
          title: 'Invalid Link',
          message: 'This link is invalid.',
        });
      }

      // Consume the token (one-time use)
      const consumed = await storage.consumeJoinToken(jti);
      if (!consumed) {
        return res.status(403).render('error', {
          title: 'Link Already Used',
          message: 'This link has already been used. Each verification link can only be used once.',
        });
      }

      // Get group data for QR code
      const group = await storage.getGroup(payload.gid);
      const joinUrl = group?.inviteCodes?.[payload.sub]?.joinUrl;
      if (!joinUrl) {
        return res.status(500).render('error', {
          title: 'Invite Unavailable',
          message: 'The invite link for this group could not be generated. Please try again later.',
        });
      }

      const qrSvg = await generateQrSvg(joinUrl);
      const ns = await storage.getNamespace(payload.ns);

      res.set('Referrer-Policy', 'no-referrer');
      res.render('qrcode', {
        qrSvg,
        joinUrl,
        groupTitle: group?.title || 'Unknown Group',
        namespace: payload.ns,
        displayName: ns?.displayName || payload.ns,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
