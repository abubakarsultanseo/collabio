# Collabio Requests aur Chat Setup (Roman Urdu)

## 1. Migration run karein
1. Supabase Dashboard open karein aur Collabio project select karein.
2. Left menu se SQL Editor open karein.
3. `supabase/migrations/0015_realtime_chat_and_preferences.sql` file ka complete SQL copy karein.
4. New query mein paste karke Run karein.
5. Success message check karein. Agar error aaye to error ka screenshot share karein; migration ko baar baar run na karein jab tak error samajh na aa jaye.

## 2. Realtime tables check karein
1. Supabase mein Database → Replication (ya Database → Publications / Realtime) open karein.
2. `supabase_realtime` publication mein `request_comments` aur `direct_chat_messages` enabled hon.
3. Migration `message_reactions` ko bhi publication mein add karne ki koshish karti hai. Agar dashboard mein missing ho to abhi add karne ki zaroorat sirf tab hai jab reactions ka full feature deploy ho.
4. RLS enabled rehna chahiye. Public access enable na karein.

## 3. Storage
Migration `chat-attachments` naam ka private bucket banati hai, 10 MB limit aur MIME allow-list ke saath.
1. Supabase → Storage open karein.
2. `chat-attachments` bucket nazar aana chahiye aur Public OFF hona chahiye.
3. Abhi attachment upload/download UI aur signed URL API implemented nahi, is liye manually public na karein aur test files upload na karein.

## 4. Vercel deployment
1. Vercel → Collabio → Deployments open karein.
2. GitHub par updated files upload karne ke baad latest deployment ka status Ready hone dein.
3. Agar environment variables change nahi kiye to extra variable add karne ki zaroorat nahi.

## 5. Manual test checklist
- [ ] `/requests` open hota hai.
- [ ] Sent aur Received switch hota hai.
- [ ] Partner selector mein All option nahi hai.
- [ ] Partner change ke baad URL mein `?partner=<id>` update hota hai.
- [ ] Page refresh ke baad last partner restore hota hai.
- [ ] `/requests/inbox?request=<id>` `/requests` par redirect hota hai aur request deep link preserve hota hai.
- [ ] `/requests/sent?partner=<id>` `/requests` par redirect hota hai.
- [ ] Do separate browsers/accounts mein request chat ka new message refresh ke baghair appear hota hai (Realtime publication/RLS enable karne ke baad).
- [ ] Unrelated account ko doosre partnership ka message nahi milta.
- [ ] Direct chat mein unrelated partner ka message subscribe/read nahi hota.

## 6. Abhi manually test na samjhein
Typing indicator, online/last seen, reactions, chat attachments, delivered ticks, reply/edit/delete aur offline-only chat email fallback is update mein complete nahi hain.
