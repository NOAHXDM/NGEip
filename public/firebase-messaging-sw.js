importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyB_uE1Ij0dNDkxB5cpsMT1qvSWsYfnhF_g',
  authDomain: 'noahxdm-eip.firebaseapp.com',
  projectId: 'noahxdm-eip',
  storageBucket: 'noahxdm-eip.firebasestorage.app',
  messagingSenderId: '498650578048',
  appId: '1:498650578048:web:a53ddd4109481f3ee67a65',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || '通知', {
    body: body || '',
    icon: '/icons8-lightweight-192.png',
    data: payload.data,
  });
});
