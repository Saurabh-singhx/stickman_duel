import { buildInviteLink } from '../net/Rooms';
import type { RoomStatus } from '../net/WebRtcTransport';

/** Focusable room screen shared by hosting, joining and connection recovery. */
export class RoomLobby {
  private readonly el = document.createElement('section');
  private readonly message = document.createElement('p');
  private readonly code = document.createElement('input');
  private readonly share = document.createElement('div');
  private readonly retry = document.createElement('button');
  private readonly title = document.createElement('h2');
  private room = '';
  private host = false;

  constructor(root: HTMLElement, onCancel: () => void, onRetry: () => void) {
    this.el.className = 'room-lobby interactive';
    this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Online room');
    this.title.tabIndex = -1;
    this.message.setAttribute('role', 'status');
    this.message.setAttribute('aria-live', 'polite');
    this.code.readOnly = true;
    this.code.setAttribute('aria-label', 'Your room code');
    this.code.onclick = () => this.code.select();
    this.share.className = 'room-actions';
    const copy = (label: string, value: () => string) => {
      const button = document.createElement('button');
      button.textContent = label;
      button.onclick = async () => {
        try {
          await navigator.clipboard.writeText(value());
          this.message.textContent = `${label === 'Copy code' ? 'Room code' : 'Invite link'} copied. Send it to your friend.`;
        } catch {
          this.code.value = value();
          this.code.focus();
          this.code.select();
          this.message.textContent = 'Copy unavailable. Select and copy the text above to share it.';
        }
      };
      return button;
    };
    this.share.append(copy('Copy code', () => this.room), copy('Copy invite link', () => buildInviteLink(this.room)));
    const actions = document.createElement('div');
    actions.className = 'room-actions';
    this.retry.textContent = 'Try again';
    this.retry.onclick = onRetry;
    const cancel = document.createElement('button');
    cancel.textContent = 'Back to menu';
    cancel.onclick = onCancel;
    actions.append(this.retry, cancel);
    this.el.append(this.title, this.code, this.message, this.share, actions);
    root.append(this.el);
  }

  public show(room: string, host: boolean): void {
    this.room = room;
    this.host = host;
    this.code.value = room;
    this.el.hidden = false;
    this.update('connecting', host ? 'Creating your room…' : 'Finding your friend’s room…');
    this.title.focus();
  }

  public update(status: RoomStatus, message: string): void {
    if (status === 'connected') { this.hide(); return; }
    this.el.hidden = false;
    this.el.dataset.state = status;
    this.title.textContent = status === 'error' ? 'Couldn’t connect' : this.host ? 'Invite a challenger' : 'Join your friend';
    this.message.textContent = message;
    this.code.hidden = this.host && status === 'connecting';
    this.share.hidden = !this.host || status !== 'waiting';
    this.retry.hidden = status !== 'error';
  }

  public hide(): void { this.el.hidden = true; }
}
