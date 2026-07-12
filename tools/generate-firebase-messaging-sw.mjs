import { readFile, writeFile } from 'node:fs/promises';

const firebaseConfig = JSON.parse(
  await readFile(new URL('../src/firebase-config.json', import.meta.url), 'utf8')
);
const packageLock = JSON.parse(
  await readFile(new URL('../package-lock.json', import.meta.url), 'utf8')
);
const firebaseVersion = packageLock.packages?.['node_modules/firebase']?.version;

if (!firebaseVersion) {
  throw new Error('無法從 package-lock.json 取得 Firebase SDK 版本');
}

const serviceWorker = `// 此檔案由 tools/generate-firebase-messaging-sw.mjs 產生，請勿手動編輯。
// Firebase 設定來源：src/firebase-config.json；SDK 版本來源：package-lock.json。
importScripts('https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(firebaseConfig, null, 2)});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || '通知', {
    body: body || '',
    icon: '/icons8-lightweight-192.png',
    data: payload.data,
  });
});
`;

await writeFile(
  new URL('../public/firebase-messaging-sw.js', import.meta.url),
  serviceWorker,
  'utf8'
);
