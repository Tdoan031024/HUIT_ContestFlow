import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = (__ENV.BASE_URL || '').replace(/\/$/, '');
const eventCode = __ENV.ATTENDANCE_CODE || '';

export const options = {
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500', 'p(99)<4000'],
  },
  scenarios: {
    event_checkin_queue: {
      executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '30s',
      stages: [
        { duration: '1m', target: 200 }, { duration: '2m', target: 1000 },
        { duration: '2m', target: 2000 }, { duration: '2m', target: 2000 }, { duration: '1m', target: 0 },
      ],
    },
  },
};

export default function () {
  if (!baseUrl || !eventCode) throw new Error('Set BASE_URL and ATTENDANCE_CODE for a dedicated open test event.');
  const url = `${baseUrl}/api/public/attendance/${eventCode}/queue`;
  const join = http.post(url, null, { tags: { operation: 'queue-join' } });
  check(join, { 'queue join accepted': (response) => response.status === 200 || response.status === 201 });
  if (join.status === 200 || join.status === 201) {
    sleep(1 + Math.random() * 3);
    const status = http.get(url, { tags: { operation: 'queue-status' } });
    check(status, { 'queue status returned': (response) => response.status === 200 });
  }
}
