const CACHE_NAME = 'soccer-game-v2';

// 설치 시 즉시 활성화
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 활성화 시 이전 캐시 정리 (필요 시)
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// 네트워크 요청 가로채기 (Network First, Fallback to Cache 전략)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Google Gemini API 요청만 캐시하지 않음 (항상 네트워크 필요)
  // fonts.googleapis.com (CSS)이나 fonts.gstatic.com (폰트 파일)은 캐시해야 함
  if (url.hostname.includes('generativelanguage.googleapis.com')) {
    return;
  }

  // 2. 그 외 모든 요청(HTML, JS, CSS, 이미지 등)은 캐시 처리
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 네트워크 요청 성공 시: 응답을 캐시에 저장하고 반환
        if (!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // POST 요청 등은 캐시 불가하므로 제외
          if (event.request.method === 'GET') {
             cache.put(event.request, responseToCache);
          }
        });

        return response;
      })
      .catch(() => {
        // 네트워크 요청 실패(오프라인) 시: 캐시된 파일 반환
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // 캐시에도 없는 경우(오프라인이고 처음 방문 등) 에러 처리 보단 index.html 반환 시도
          if (event.request.headers.get('accept').includes('text/html')) {
             return caches.match('./index.html');
          }
        });
      })
  );
});