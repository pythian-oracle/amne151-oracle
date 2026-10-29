/* Shared Firebase init (CDN modular SDK via dynamic import). Sphinx live mode. */
(function (global) {
  'use strict';

  var SDK = 'https://www.gstatic.com/firebasejs/13.1.0';
  var ready = null;

  function notConfiguredError() {
    var err = new Error('Firebase is not configured yet.');
    err.code = 'SPHINX_NOT_CONFIGURED';
    return err;
  }

  function ensureConfigured() {
    if (typeof global.firebaseIsConfigured !== 'function' || !global.firebaseIsConfigured()) {
      throw notConfiguredError();
    }
  }

  function initFirebase() {
    if (ready) return ready;
    ensureConfigured();
    ready = Promise.all([
      import(SDK + '/firebase-app.js'),
      import(SDK + '/firebase-auth.js'),
      import(SDK + '/firebase-database.js')
    ]).then(function (mods) {
      var appMod = mods[0], authMod = mods[1], dbMod = mods[2];
      var app = appMod.initializeApp(global.FIREBASE_CONFIG);
      var auth = authMod.getAuth(app);
      var db = dbMod.getDatabase(app);
      return {
        app: app,
        auth: auth,
        db: db,
        signInAnonymously: function () { return authMod.signInAnonymously(auth); },
        onAuthStateChanged: function (cb) { return authMod.onAuthStateChanged(auth, cb); },
        ref: function (path) { return dbMod.ref(db, path); },
        set: dbMod.set,
        update: dbMod.update,
        remove: dbMod.remove,
        onValue: dbMod.onValue,
        off: dbMod.off,
        get: dbMod.get,
        serverTimestamp: dbMod.serverTimestamp,
        child: dbMod.child
      };
    });
    return ready;
  }

  global.SphinxFirebase = {
    init: initFirebase,
    isConfigured: function () {
      return typeof global.firebaseIsConfigured === 'function' && global.firebaseIsConfigured();
    }
  };
})(window);
