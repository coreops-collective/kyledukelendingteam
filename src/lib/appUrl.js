// Canonical public URL for the hub.
//
// Used as the "Log in to view" link in notification emails and in webhook
// payloads sent to GHL, so it has to be the address a RECIPIENT can open —
// not window.location.origin, which would point teammates at a deploy
// preview whenever the sender happened to be on one.
//
// This is the single line to change when the domain moves. Flipped to the
// custom domain on 2026-09-18 once DNS verified and the certificate issued.
//
// The netlify.app address still works — Netlify serves both — so anyone with
// the old URL bookmarked is fine. This constant only decides which address
// gets EMAILED to people, and that should be the one they'll keep using.
export const HUB_URL = 'https://hub.thekyleduketeam.com/';
