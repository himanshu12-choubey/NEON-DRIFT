// ============================================================================
// ui.js — DOM rendering & wiring for menus, shop, missions, settings, HUD.
// Keeps game.js / main.js focused on simulation logic.
// ============================================================================
import { CHARACTERS, OUTFITS, BOARDS, POWER_UPGRADES, powerValue, powerUpgradeCost } from './data.js';

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement('div'); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class UI {
  constructor(store, audio, callbacks) {
    this.store = store;
    this.audio = audio;
    this.cb = callbacks; // { onPlay, onCharSelect, onBuy, onEquip, onUpgrade, onClaimMission, onResetSave }
    this.shopTab = 'runners';
    this._wireStatic();
    this.refreshMenu();
  }

  toColorHex(n) { return '#' + n.toString(16).padStart(6, '0'); }

  playClick() { this.audio.resume(); this.audio.uiClick(); }

  _wireStatic() {
    document.querySelectorAll('.btn, .tab, .switch, .char-card').forEach(() => {});

    $('#btnPlay').onclick = () => { this.playClick(); this.cb.onPlay(); };
    $('#btnShop').onclick = () => { this.playClick(); this.openShop(); };
    $('#btnMissions').onclick = () => { this.playClick(); this.openMissions(); };
    $('#btnSettings').onclick = () => { this.playClick(); this.openSettings(); };
    $('#btnHow').onclick = () => { this.playClick(); $('#howPanel').classList.remove('hidden'); };
    $('#btnHowClose').onclick = () => { this.playClick(); $('#howPanel').classList.add('hidden'); };

    $('#btnShopClose').onclick = () => { this.playClick(); $('#shopPanel').classList.add('hidden'); };
    document.querySelectorAll('#shopPanel .tab').forEach(tab => {
      tab.onclick = () => {
        this.playClick();
        document.querySelectorAll('#shopPanel .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.shopTab = tab.dataset.tab;
        this.renderShopList();
      };
    });

    $('#btnMissionsClose').onclick = () => { this.playClick(); $('#missionsPanel').classList.add('hidden'); };

    $('#btnSettingsClose').onclick = () => { this.playClick(); $('#settingsPanel').classList.add('hidden'); this.cb.onSettingsChanged && this.cb.onSettingsChanged(); };
    $('#btnResetSave').onclick = () => {
      if (confirm('Reset all progress, coins and unlocks? This cannot be undone.')) {
        this.cb.onResetSave();
        this.refreshMenu();
        $('#settingsPanel').classList.add('hidden');
      }
    };
    this._wireSwitch('#toggleMusic', 'music');
    this._wireSwitch('#toggleSfx', 'sfx');
    this._wireSwitch('#toggleShake', 'shake');
    this._wireSwitch('#toggleBloom', 'bloom');
    this._wireSwitch('#toggleFps', 'fps');
    this._wireSwitch('#toggleInvert', 'invertSwipe');

    $('#btnResume').onclick = () => { this.playClick(); this.cb.onResume(); };
    $('#btnPauseSettings').onclick = () => { this.playClick(); this.openSettings(); };
    $('#btnPauseQuit').onclick = () => { this.playClick(); this.cb.onQuit(); };

    $('#btnRetry').onclick = () => { this.playClick(); this.cb.onPlay(); };
    $('#btnGoMenu').onclick = () => { this.playClick(); this.cb.onGoMenu(); this.refreshMenu(); };

    this._applySwitchStates();
  }

  _wireSwitch(sel, key) {
    const node = $(sel);
    node.onclick = () => {
      this.playClick();
      this.store.data.settings[key] = !this.store.data.settings[key];
      this.store.persist();
      this._applySwitchStates();
      this.cb.onSettingsChanged && this.cb.onSettingsChanged();
    };
  }

  _applySwitchStates() {
    const s = this.store.data.settings;
    const map = { '#toggleMusic': 'music', '#toggleSfx': 'sfx', '#toggleShake': 'shake', '#toggleBloom': 'bloom', '#toggleFps': 'fps', '#toggleInvert': 'invertSwipe' };
    for (const [sel, key] of Object.entries(map)) $(sel).classList.toggle('on', !!s[key]);
    $('#fpsCounter').classList.toggle('hidden', !s.fps);
  }

  // ------------------------------------------------------------- MENU ----
  refreshMenu() {
    $('#menuCoins').textContent = this.store.data.coins;
    $('#menuBest').textContent = Math.floor(this.store.data.bestDistance);
    $('#hudBest').querySelector('.value').textContent = Math.floor(this.store.data.bestDistance);
    this.renderCharStrip();
  }

  renderCharStrip() {
    const strip = $('#menuCharStrip');
    strip.innerHTML = '';
    for (const c of CHARACTERS) {
      const owned = this.store.data.ownedCharacters.includes(c.id);
      const selected = this.store.data.equippedCharacter === c.id;
      const card = el('div', `char-card ${selected ? 'selected' : ''} ${owned ? '' : 'char-locked'}`);
      const outfitId = this.store.data.equippedOutfit[c.id];
      const outfit = OUTFITS.find(o => o.id === outfitId);
      const tint = outfit ? outfit.tint : c.primary;
      card.appendChild(el('div', 'char-swatch', '')).style.background = `radial-gradient(circle at 35% 30%, ${this.toColorHex(tint)}, #05040d 75%)`;
      card.appendChild(el('div', 'char-name display-font', owned ? c.name : `🔒 ${c.name}`));
      card.onclick = () => {
        this.playClick();
        if (owned) {
          this.store.data.equippedCharacter = c.id;
          this.store.persist();
          this.renderCharStrip();
          this.cb.onCharSelect && this.cb.onCharSelect();
        } else {
          this.openShop('runners');
        }
      };
      strip.appendChild(card);
    }
  }

  // ------------------------------------------------------------- SHOP ----
  openShop(tab) {
    if (tab) {
      this.shopTab = tab;
      document.querySelectorAll('#shopPanel .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    }
    $('#shopPanel').classList.remove('hidden');
    $('#shopCoins').textContent = this.store.data.coins;
    this.renderShopList();
  }

  renderShopList() {
    const list = $('#shopList');
    list.innerHTML = '';
    $('#shopCoins').textContent = this.store.data.coins;

    if (this.shopTab === 'runners') {
      for (const c of CHARACTERS) this._renderRunnerCard(list, c);
    } else if (this.shopTab === 'outfits') {
      const equippedChar = this.store.data.equippedCharacter;
      for (const o of OUTFITS.filter(o => o.charId === equippedChar)) this._renderOutfitCard(list, o);
      const note = el('div', '', `<p style="font-size:11px;color:var(--text-dim);text-align:center;margin-top:6px;">Showing outfits for your selected runner.</p>`);
      list.appendChild(note);
    } else if (this.shopTab === 'boards') {
      for (const b of BOARDS) this._renderBoardCard(list, b);
    } else if (this.shopTab === 'upgrades') {
      for (const p of POWER_UPGRADES) this._renderUpgradeCard(list, p);
    }
  }

  _card(colorHex, name, desc) {
    const card = el('div', 'item-card');
    const swatch = el('div', 'item-swatch');
    swatch.style.background = colorHex; swatch.style.color = colorHex;
    const info = el('div', 'item-info');
    info.appendChild(el('div', 'item-name display-font', name));
    info.appendChild(el('div', 'item-desc', desc));
    card.appendChild(swatch); card.appendChild(info);
    return card;
  }

  _renderRunnerCard(list, c) {
    const owned = this.store.data.ownedCharacters.includes(c.id);
    const equipped = this.store.data.equippedCharacter === c.id;
    const card = this._card(this.toColorHex(c.primary), c.name, c.desc);
    const btn = document.createElement('button');
    btn.className = 'btn btn-small' + (equipped ? '' : owned ? '' : ' btn-primary');
    btn.style.width = '84px'; btn.style.flex = 'none';
    btn.textContent = equipped ? 'Equipped' : owned ? 'Select' : `◆ ${c.price}`;
    btn.disabled = equipped;
    btn.onclick = () => {
      this.playClick();
      if (owned) { this.store.data.equippedCharacter = c.id; this.store.persist(); }
      else if (this.store.spendCoins(c.price)) { this.store.data.ownedCharacters.push(c.id); this.store.data.equippedCharacter = c.id; this.store.persist(); this.audio.powerup(); }
      else { this._flashInsufficient(); return; }
      this.renderShopList(); this.refreshMenu(); this.cb.onCharSelect && this.cb.onCharSelect();
    };
    card.appendChild(btn);
    list.appendChild(card);
  }

  _renderOutfitCard(list, o) {
    const owned = this.store.data.ownedOutfits.includes(o.id);
    const equipped = this.store.data.equippedOutfit[o.charId] === o.id;
    const card = this._card(this.toColorHex(o.tint), o.name, owned ? 'Owned cosmetic' : 'Recolor unlock');
    const btn = document.createElement('button');
    btn.className = 'btn btn-small' + (equipped ? '' : owned ? '' : ' btn-primary');
    btn.style.width = '84px'; btn.style.flex = 'none';
    btn.textContent = equipped ? 'Equipped' : owned ? 'Select' : `◆ ${o.price}`;
    btn.disabled = equipped;
    btn.onclick = () => {
      this.playClick();
      if (owned) { this.store.data.equippedOutfit[o.charId] = o.id; this.store.persist(); }
      else if (this.store.spendCoins(o.price)) { this.store.data.ownedOutfits.push(o.id); this.store.data.equippedOutfit[o.charId] = o.id; this.store.persist(); this.audio.powerup(); }
      else { this._flashInsufficient(); return; }
      this.renderShopList(); this.refreshMenu(); this.cb.onCharSelect && this.cb.onCharSelect();
    };
    card.appendChild(btn);
    list.appendChild(card);
  }

  _renderBoardCard(list, b) {
    const owned = this.store.data.ownedBoards.includes(b.id);
    const equipped = this.store.data.equippedBoard === b.id;
    const card = this._card(this.toColorHex(b.tint), b.name, owned ? 'Owned hoverboard' : 'Speed-boost trail cosmetic');
    const btn = document.createElement('button');
    btn.className = 'btn btn-small' + (equipped ? '' : owned ? '' : ' btn-primary');
    btn.style.width = '84px'; btn.style.flex = 'none';
    btn.textContent = equipped ? 'Equipped' : owned ? 'Select' : `◆ ${b.price}`;
    btn.disabled = equipped;
    btn.onclick = () => {
      this.playClick();
      if (owned) { this.store.data.equippedBoard = b.id; this.store.persist(); }
      else if (this.store.spendCoins(b.price)) { this.store.data.ownedBoards.push(b.id); this.store.data.equippedBoard = b.id; this.store.persist(); this.audio.powerup(); }
      else { this._flashInsufficient(); return; }
      this.renderShopList(); this.refreshMenu();
    };
    card.appendChild(btn);
    list.appendChild(card);
  }

  _renderUpgradeCard(list, p) {
    const lvl = this.store.data.powerLevels[p.key] || 0;
    const val = powerValue(this.store, p.key);
    const cost = powerUpgradeCost(this.store, p.key);
    const card = this._card('#7b5bff', `${p.name} · Lv${lvl}`, `Current: ${val.toFixed(1)}${p.unit}`);
    const btn = document.createElement('button');
    btn.className = 'btn btn-small' + (cost ? ' btn-primary' : '');
    btn.style.width = '84px'; btn.style.flex = 'none';
    btn.textContent = cost ? `◆ ${cost}` : 'MAX';
    btn.disabled = !cost;
    btn.onclick = () => {
      this.playClick();
      if (cost && this.store.spendCoins(cost)) {
        this.store.data.powerLevels[p.key] = lvl + 1;
        this.store.persist();
        this.audio.powerup();
        this.renderShopList();
      } else if (cost) this._flashInsufficient();
    };
    card.appendChild(btn);
    list.appendChild(card);
  }

  _flashInsufficient() {
    const chip = $('#shopCoins').closest('.chip') || $('#shopCoins');
    chip.style.color = 'var(--neon-magenta)';
    setTimeout(() => { chip.style.color = ''; }, 300);
  }

  // --------------------------------------------------------- MISSIONS ----
  openMissions() {
    $('#missionsPanel').classList.remove('hidden');
    this.renderMissions();
  }

  renderMissions() {
    const list = $('#missionList');
    list.innerHTML = '';
    for (const m of this.store.data.missions.list) {
      const card = el('div', 'mission-card');
      const pct = Math.min(100, (m.progress / m.goal) * 100);
      card.innerHTML = `
        <div class="row-between">
          <span style="font-size:13px;">${m.label}</span>
          <span style="font-size:12px;color:var(--neon-amber);">◆${m.reward}</span>
        </div>
        <div class="mission-bar"><div class="mission-bar-fill" style="width:${pct}%"></div></div>
        <div class="row-between" style="margin-top:6px;">
          <span style="font-size:11px;color:var(--text-dim);">${Math.min(m.progress, m.goal)} / ${m.goal}</span>
        </div>`;
      if (m.done && !m.claimed) {
        const claimBtn = document.createElement('button');
        claimBtn.className = 'btn btn-primary btn-small';
        claimBtn.style.marginTop = '8px';
        claimBtn.textContent = 'Claim Reward';
        claimBtn.onclick = () => { this.playClick(); this.cb.onClaimMission(m.id); this.renderMissions(); this.refreshMenu(); };
        card.appendChild(claimBtn);
      } else if (m.claimed) {
        card.style.opacity = '0.55';
      }
      list.appendChild(card);
    }

    const ach = $('#achievementList');
    ach.innerHTML = '';
    for (const a of this.store.achievementsData) {
      const unlocked = !!this.store.data.achievements[a.id];
      const card = el('div', 'mission-card', `
        <div class="row-between">
          <span style="font-size:13px;">${unlocked ? '✅' : '🔒'} ${a.name}</span>
          <span style="font-size:12px;color:var(--neon-amber);">◆${a.reward}</span>
        </div>
        <div class="item-desc">${a.desc}</div>`);
      if (unlocked) card.style.opacity = '0.6';
      ach.appendChild(card);
    }

    const ms = this.store.msUntilReset();
    const h = Math.floor(ms / 3600000), m2 = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
    $('#missionResetLabel').textContent = `resets in ${String(h).padStart(2, '0')}:${String(m2).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  openSettings() { $('#settingsPanel').classList.remove('hidden'); this._applySwitchStates(); }

  showMissionToast(text) {
    const t = $('#missionToast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
}
