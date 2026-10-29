/* =====================================================================
   FIREBASE CONFIG — public web client keys for project amne151-sphinx.
   Safe to commit. Still must: enable Anonymous Auth + publish
   database.rules.json (see SETUP.md). SDK modules load from gstatic 13.1.0.
   ===================================================================== */
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDMcPVLzb1ARmkFTplpmywts7McHEavfdc',
  authDomain: 'amne151-sphinx.firebaseapp.com',
  databaseURL: 'https://amne151-sphinx-default-rtdb.firebaseio.com',
  projectId: 'amne151-sphinx',
  storageBucket: 'amne151-sphinx.firebasestorage.app',
  messagingSenderId: '539397079232',
  appId: '1:539397079232:web:f09b24baab1cd975cd6d25'
};

/** True only when placeholders have been replaced with real values. */
window.firebaseIsConfigured = function () {
  var c = window.FIREBASE_CONFIG || {};
  if (!c.apiKey || !c.databaseURL || !c.projectId) return false;
  if (/^PASTE_/i.test(c.apiKey)) return false;
  if (/PASTE_/i.test(String(c.appId || ''))) return false;
  if (/PASTE_/i.test(String(c.messagingSenderId || ''))) return false;
  return true;
};
