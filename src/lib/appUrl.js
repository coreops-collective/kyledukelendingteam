// Canonical public URL for the hub.
//
// Used as the "Log in to view" link in notification emails and in webhook
// payloads sent to GHL, so it has to be the address a RECIPIENT can open —
// not window.location.origin, which would point teammates at a deploy
// preview whenever the sender happened to be on one.
//
// This is the single line to change when the domain moves. It is still the
// netlify.app address on purpose: hub.thekyleduketeam.com has no DNS record
// yet, and pointing notification links at a host that doesn't resolve would
// break every email in the meantime. Flip it once the CNAME is live and the
// certificate has issued.
//
// The netlify.app address keeps working after the custom domain is added —
// Netlify serves both — so there is no window where this is wrong.
export const HUB_URL = 'https://thekyleduketeam.netlify.app/';
