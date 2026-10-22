/* Local audio only. First five stages sound identical across rarities. */
(function (global) {
  const base = new URL('./assets/audio/', document.currentScript?.src || document.baseURI).href;
  class BoxAudio {
    constructor(options = {}) {
      this.options = options;
      this.nodes = new Set();
      this.enabled = options.enabled !== false;
      this.context = null;
      this.buffers = {};
      this.ready = null;
      this.generation = 0;
    }
    prepare() {
      if (!this.context) {
        const C = global.AudioContext || global.webkitAudioContext;
        if (!C) return Promise.resolve();
        this.context = new C();
        this.gain = this.context.createGain();
        this.gain.gain.value = this.enabled ? 0.75 : 0;
        this.gain.connect(this.context.destination);
        this.ready = Promise.all(
          ['seal', 'lid', 'normal', 'purple', 'gold'].map(async (key) => {
            try {
              const response = await fetch(
                this.options.sources?.[key] || new URL(key + '.wav', this.options.base || base),
              );
              if (!response.ok) throw Error('Audio unavailable');
              this.buffers[key] = await this.context.decodeAudioData(await response.arrayBuffer());
            } catch (error) {
              console.warn('Box audio cue unavailable:', key);
            }
          }),
        );
      }
      this.context?.resume().catch(() => {});
      return this.ready || Promise.resolve();
    }
    setEnabled(enabled) {
      this.enabled = enabled;
      if (this.context) this.gain.gain.setValueAtTime(enabled ? 0.75 : 0, this.context.currentTime);
      if (enabled) this.prepare();
    }
    start(rarity) {
      this.stop();
      const generation = this.generation;
      const ready = this.prepare();
      const wall = performance.now();
      ready.then(() => {
        if (generation !== this.generation || !this.context || this.context.state !== 'running')
          return;
        const passed = (performance.now() - wall) / 1000;
        for (const [key, delay] of [
          ['seal', 1],
          ['lid', 1.3],
          ['lid', 2.5],
          [rarity, 2.5],
        ]) {
          const buffer = this.buffers[key];
          if (!buffer || passed > delay + 0.12) continue;
          const source = this.context.createBufferSource();
          source.buffer = buffer;
          source.connect(this.gain);
          this.nodes.add(source);
          source.onended = () => {
            this.nodes.delete(source);
            source.disconnect();
          };
          source.start(this.context.currentTime + Math.max(0, delay - passed));
        }
      });
    }
    stop() {
      this.generation++;
      for (const node of this.nodes) {
        try {
          node.stop();
          node.disconnect();
        } catch {}
      }
      this.nodes.clear();
    }
    destroy() {
      this.stop();
      if (this.context) this.context.close().catch(() => {});
    }
  }
  global.BoxAudio = BoxAudio;
})(window);
