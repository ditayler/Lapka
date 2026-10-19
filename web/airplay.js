/* Safari's picker must be called synchronously from the button click.
   Prepare the network URL beforehand, and revoke it when its source is left. */
(() => {
'use strict';
window.LapkaAirplay = class {
  constructor({ video, button, post, onNative, onLocal, onError }) {
    Object.assign(this, { video, button, post, onNative, onLocal, onError });
    this.supported = typeof video.webkitShowPlaybackTargetPicker === 'function';
    this.native = false;
    this.wireless = false;
    this.session = null;
    this.generation = 0;
    button.hidden = !this.supported;
    button.disabled = true;
    button.addEventListener('click', () => {
      if (!this.session || this.session.expires && this.session.expires <= Date.now()) {
        this.onError(this.error || new Error('AirPlay session expired'));
        return;
      }
      try {
        if (!this.native) { this.native = true; this.onNative(this.session.url); }
        video.webkitShowPlaybackTargetPicker();
      } catch (e) {
        this.native = false;
        this.onLocal();
        this.onError(e);
      }
    });
    video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () => {
      const was = this.wireless;
      this.wireless = !!video.webkitCurrentPlaybackTargetIsWireless;
      button.classList.toggle('on', this.wireless);
      button.setAttribute('aria-pressed', String(this.wireless));
      if (was && !this.wireless) {
        const resume = this.native && this.session;
        this.native = false;
        if (resume) this.onLocal();
      }
    });
  }
  revoke(session) {
    if (session) this.post('/api/airplay/stop?token=' + encodeURIComponent(session.token)).catch(() => {});
  }
  suspend() {
    this.generation++;
    this.revoke(this.session);
    this.session = null;
    this.error = null;
    this.button.disabled = true;
  }
  clear() {
    this.suspend();
    this.native = false;
    this.wireless = false;
    this.button.classList.toggle('on', false);
    this.button.setAttribute('aria-pressed', 'false');
  }
  async prepare(stream) {
    this.suspend();
    const generation = this.generation;
    if (!this.supported || !stream.id) return null;
    try {
      const session = await this.post('/api/airplay?stream=' + encodeURIComponent(stream.id) +
        (stream.audio ? '&audio=' + stream.audio.index : ''));
      if (generation !== this.generation) { this.revoke(session); return null; }
      this.session = session;
      this.button.disabled = false;
      return this.native ? session.url : null;
    } catch (e) {
      if (generation === this.generation) { this.error = e; this.button.disabled = false; }
      return null;
    }
  }
};
})();
