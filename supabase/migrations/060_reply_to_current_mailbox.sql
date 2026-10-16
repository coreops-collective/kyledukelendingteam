-- 060: point the hub's outbound Reply-To at Kyle's current mailbox.
--
-- email_settings.reply_to_email was still kyle.duke@valorhl.com — set before
-- the Valor Home Loans → Nexa Mortgage rebrand and before Kyle's login moved
-- to @thekyleduketeam.com. That address is the Reply-To on EVERY email the hub
-- sends: new contract, stage change, @-mention, workflow task. So any client or
-- realtor who hit Reply was answering to a pre-rebrand mailbox.
--
-- Lauren chose kyle@thekyleduketeam.com (2026-10-16). It matches his hub login
-- and the hub's own domain, and it is a mailbox known to be live.
--
-- Guarded on the old value rather than set unconditionally, so this is safe to
-- re-run and cannot clobber a later change made from Setup → Email Delivery.
-- If someone has already moved it, this is a no-op.
--
-- Data-only: no schema change, nothing renamed, dropped or transformed, and
-- the one row it touches is config rather than anyone's loan or client record.

update public.email_settings
   set reply_to_email = 'kyle@thekyleduketeam.com',
       updated_at = now()
 where lower(coalesce(reply_to_email, '')) = 'kyle.duke@valorhl.com';

notify pgrst, 'reload schema';
