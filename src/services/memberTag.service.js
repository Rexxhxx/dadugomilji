'use strict';

/**
 * Gelar admin grup berdasarkan total deposit HARIAN.
 *
 * - Hari ini total deposit sukses >= MEMBER_TAG_MIN_DEPOSIT → user dijadikan
 *   admin TANPA hak apa pun lalu diberi custom title DEPOSIT_TAG.
 * - Gelar bertahan sampai akhir hari berikutnya. Kalau hari berikutnya tidak
 *   mencapai batas lagi, user diturunkan dari admin saat lewat tengah malam WIB.
 *
 * Batas aman: hanya admin yang DIBUAT oleh fitur ini (tercatat di member_tags)
 * yang boleh diubah/diturunkan. Admin lama, owner grup, dan gelar dari perintah
 * `add @user <title>` (tabel title_admins) tidak pernah disentuh.
 *
 * Selalu lewat bot 1 (BOT_TOKEN), yang harus admin di grup dengan izin
 * "Add New Admins" (can_promote_members).
 */

const { Api } = require('grammy');
const { env } = require('../config');
const { transactions, memberTags, titleAdmins } = require('../database');
const { getTodayWib } = require('../utils/time');

/** Maks 16 karakter, tanpa emoji (aturan Telegram). */
const DEPOSIT_TAG = 'PERINTIS DADU';
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

// Semua hak false = DEMOTE menurut Bot API, jadi dipakai untuk mencabut gelar.
const NO_RIGHTS = Object.freeze({
  is_anonymous: false,
  can_manage_chat: false,
  can_change_info: false,
  can_delete_messages: false,
  can_invite_users: false,
  can_restrict_members: false,
  can_pin_messages: false,
  can_promote_members: false,
  can_manage_video_chats: false,
  can_manage_topics: false,
  can_post_stories: false,
  can_edit_stories: false,
  can_delete_stories: false,
});

// Promote butuh minimal satu hak true. can_manage_chat paling ringan: hanya
// bisa lihat log admin/statistik dan lewati slow mode; tidak bisa ubah apa pun.
const TITLE_ONLY_RIGHTS = Object.freeze({ ...NO_RIGHTS, can_manage_chat: true });

let tagApi = null;
const getApi = () => (tagApi ??= new Api(env.botToken));
const chatId = () => env.memberTagChatId;
const describe = (err) => err?.description || err?.message || err;
const isAdminStatus = (status) => status === 'administrator' || status === 'creator';

/** Pasang gelar untuk user yang memenuhi syarat hari ini. True kalau gelar aktif. */
async function grantTag(userId, today) {
  if (titleAdmins.isTitleAdmin(userId)) {
    console.log(`🏷️ ${userId} sudah punya gelar dari perintah add, dilewati.`);
    return false;
  }

  const ownRecord = memberTags.getMemberTag(userId);
  try {
    const api = getApi();
    const member = await api.getChatMember(chatId(), userId);

    // Admin yang bukan buatan fitur ini (admin lama / owner grup) tidak diubah.
    if (isAdminStatus(member.status) && !ownRecord) {
      console.log(`🏷️ ${userId} sudah admin grup, gelar deposit tidak dipasang.`);
      return false;
    }

    if (!isAdminStatus(member.status) || member.custom_title !== DEPOSIT_TAG) {
      if (!isAdminStatus(member.status)) await api.promoteChatMember(chatId(), userId, TITLE_ONLY_RIGHTS);
      await api.setChatAdministratorCustomTitle(chatId(), userId, DEPOSIT_TAG);
      console.log(`🏷️ Gelar ${DEPOSIT_TAG} dipasang untuk ${userId}`);
    }
    memberTags.saveMemberTag(userId, DEPOSIT_TAG, today);
    return true;
  } catch (err) {
    // Biasanya: user belum masuk grup, atau bot belum punya izin "Add New Admins".
    console.warn(`⚠️ Gagal pasang gelar ${DEPOSIT_TAG} untuk ${userId}:`, describe(err));
    return false;
  }
}

/** Dipanggil setelah deposit sukses. Tidak pernah melempar: gelar tidak boleh mengganggu deposit. */
async function applyDepositTag(userId) {
  if (!chatId()) return;

  const today = getTodayWib();
  const total = transactions.getDailyDepositRupiah(userId, today);
  if (total < env.memberTagMinDeposit) {
    console.log(`🏷️ ${userId} deposit hari ini Rp${total}, belum capai Rp${env.memberTagMinDeposit} untuk gelar.`);
    return;
  }
  await grantTag(userId, today);
}

/**
 * Pasang gelar untuk semua user yang sudah memenuhi syarat hari ini tapi belum
 * tercatat (deposit sebelum fitur aktif / bot restart / pemasangan gagal).
 */
async function syncTodayTags() {
  const today = getTodayWib();
  for (const row of transactions.getDailyDepositQualifiers(today, env.memberTagMinDeposit)) {
    const record = memberTags.getMemberTag(row.user_id);
    if (record && record.qualified_date === today) continue;
    await grantTag(row.user_id, today);
  }
}

/** Turunkan admin gelar deposit yang syarat hariannya tidak terpenuhi lagi. */
async function removeExpiredTags() {
  for (const row of memberTags.getExpiredMemberTags(getTodayWib())) {
    try {
      // Owner menjadikannya admin lewat `add` setelah gelar deposit: biarkan.
      if (titleAdmins.isTitleAdmin(row.user_id)) {
        memberTags.deleteMemberTag(row.user_id);
        continue;
      }

      const api = getApi();
      const member = await api.getChatMember(chatId(), row.user_id);
      // Hanya turunkan kalau gelarnya masih gelar deposit; kalau sudah diganti manual, jangan disentuh.
      if (member.status === 'administrator' && member.custom_title === DEPOSIT_TAG) {
        await api.promoteChatMember(chatId(), row.user_id, NO_RIGHTS);
        console.log(`🏷️ Gelar ${DEPOSIT_TAG} dicabut dari ${row.user_id}`);
      } else if (member.status === 'member') {
        // Sisa versi lama (member tag): kosongkan, abaikan kalau gagal.
        await api.raw.setChatMemberTag({ chat_id: chatId(), user_id: row.user_id, tag: '' }).catch(() => {});
      }
      memberTags.deleteMemberTag(row.user_id);
    } catch (err) {
      // Jaringan / 429 / izin: catatan tetap disimpan supaya dicoba lagi di putaran berikutnya.
      console.warn(`⚠️ Gagal cabut gelar untuk ${row.user_id}:`, describe(err));
    }
  }
}

function startMemberTagScheduler() {
  if (!chatId()) {
    console.log('🏷️ Gelar deposit nonaktif (MEMBER_TAG_CHAT_ID kosong).');
    return null;
  }
  console.log(`🏷️ Gelar deposit aktif: grup ${chatId()}, minimal Rp${env.memberTagMinDeposit}/hari.`);
  const tick = async () => {
    try {
      await syncTodayTags();
      await removeExpiredTags();
    } catch (err) {
      console.error('⚠️ Sinkron gelar deposit gagal:', describe(err));
    }
  };
  tick();
  return setInterval(tick, CHECK_INTERVAL_MS);
}

module.exports = { applyDepositTag, removeExpiredTags, startMemberTagScheduler, DEPOSIT_TAG };
