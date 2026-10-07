/**
 * Thông báo của Vala Desktop. Mọi thông báo đi qua đây để:
 *   - bấm vào LUÔN đưa ứng dụng lên (kể cả khi đang chạy nền ở khay): việc riêng của thông báo nếu có (vd mở đúng tab hệ
 *     thống nguồn), không thì hiện cửa sổ ở tab đang chọn;
 *   - GIỮ tham chiếu tới thông báo: Electron mất sự kiện 'click' nếu đối tượng Notification bị dọn bộ nhớ trước khi người
 *     dùng bấm (hay gặp trên Linux, thông báo còn nằm trong trung tâm thông báo rất lâu).
 */
import { Notification } from 'electron';
import { ICON } from './channel';

/** Giữ các thông báo gần nhất (thông báo cũ hơn coi như đã bị trung tâm thông báo bỏ). */
const KEEP = 30;
const live: Notification[] = [];
let reveal: () => void = () => {};

/** Hành động mặc định khi bấm thông báo (main.ts: hiện cửa sổ ứng dụng). */
export function setNotifyReveal(fn: () => void): void { reveal = fn; }

export function notify(title: string, body = '', onClick?: () => void): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON });
  const drop = () => { const i = live.indexOf(n); if (i >= 0) live.splice(i, 1); };
  n.on('click', () => {
    drop();
    reveal();                 // luôn đưa cửa sổ lên trước…
    onClick?.();              // …rồi tới việc riêng (vd chuyển sang tab hệ thống nguồn)
  });
  n.on('close', drop);
  n.on('failed', drop);
  live.push(n);
  if (live.length > KEEP) live.shift();
  n.show();
}
