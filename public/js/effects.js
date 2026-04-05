(function() {
  const { state, dom } = GPP;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getFxLayer() {
    let layer = document.getElementById('fxLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'fxLayer';
      layer.className = 'fxLayer';
      document.body.appendChild(layer);
    }
    return layer;
  }

  function createFxBox(text, className) {
    const node = document.createElement('div');
    node.className = `fxBox ${className || ''}`.trim();
    node.textContent = text;
    return node;
  }

  function placeNodeAtCenter(node, rect) {
    node.style.left = `${rect.left + rect.width / 2}px`;
    node.style.top = `${rect.top + rect.height / 2}px`;
  }

  function moveNodeTo(node, rect, duration) {
    return new Promise((resolve) => {
      node.style.transition = `left ${duration}ms ease, top ${duration}ms ease, opacity ${duration}ms ease`;
      requestAnimationFrame(() => {
        placeNodeAtCenter(node, rect);
        node.style.opacity = '1';
      });
      setTimeout(resolve, duration + 40);
    });
  }

  function getZoneByPlayerId(playerId) {
    return playerId === state.me ? dom.selfZone : dom.enemyZone;
  }

  function getHpBadgeByPlayerId(playerId) {
    return document.querySelector(`.hpBadge[data-player-id="${playerId}"]`);
  }

  function setHpBadge(playerId, hp) {
    const badge = getHpBadgeByPlayerId(playerId);
    if (badge) badge.textContent = `HP ${hp}`;
  }

  async function animateHealEvent(event) {
    const badge = getHpBadgeByPlayerId(event.playerId);
    if (!badge) return;

    const layer = getFxLayer();
    setHpBadge(event.playerId, event.hpBefore);

    const plus = document.createElement('div');
    plus.className = 'healFloat';
    plus.textContent = `+${event.amount}`;
    layer.appendChild(plus);

    const rect = badge.getBoundingClientRect();
    plus.style.left = `${rect.left + rect.width / 2}px`;
    plus.style.top = `${rect.top + rect.height / 2}px`;

    await sleep(80);
    plus.classList.add('show');
    await sleep(700);
    setHpBadge(event.playerId, event.hpAfter);
    plus.remove();
  }

  async function animateDamageEvent(event) {
    const layer = getFxLayer();
    const attackerZone = getZoneByPlayerId(event.attackerId);
    const defenderZone = getZoneByPlayerId(event.defenderId);
    if (!attackerZone || !defenderZone) return;

    const attackerRect = attackerZone.getBoundingClientRect();
    const defenderRect = defenderZone.getBoundingClientRect();
    const centerRect = {
      left: window.innerWidth / 2 - 50,
      top: window.innerHeight / 2 - 20,
      width: 100,
      height: 40,
    };

    const atkClass = event.pierce ? 'atkBox pierceBox' : 'atkBox';
    const atkBox = createFxBox(`攻击 ${event.attackValue}`, atkClass);
    const defBox = createFxBox(`防守 ${event.defenseValue}`, 'defBox');
    layer.appendChild(atkBox);
    layer.appendChild(defBox);

    placeNodeAtCenter(atkBox, attackerRect);
    placeNodeAtCenter(defBox, defenderRect);

    await Promise.all([moveNodeTo(atkBox, centerRect, 350), moveNodeTo(defBox, centerRect, 350)]);

    atkBox.remove();
    defBox.remove();

    const hpBadge = getHpBadgeByPlayerId(event.defenderId);
    if (!hpBadge) return;
    setHpBadge(event.defenderId, event.hpBefore);

    const hpRect = hpBadge.getBoundingClientRect();
    const damageBox = createFxBox('伤害', 'damageBox');
    layer.appendChild(damageBox);
    placeNodeAtCenter(damageBox, centerRect);

    let hpNow = event.hpBefore;
    const hits = event.hits || [];
    for (let i = 0; i < hits.length; i += 1) {
      const dmg = hits[i];
      damageBox.textContent = `伤害 ${dmg}`;
      await moveNodeTo(damageBox, hpRect, 280);
      hpNow -= dmg;
      if (hpNow < 0) hpNow = 0;
      if (!event.forceField) {
        setHpBadge(event.defenderId, hpNow);
      }
      await sleep(160);
      placeNodeAtCenter(damageBox, centerRect);
      damageBox.style.opacity = '0.92';
      await sleep(90);
    }

    if (event.forceField) {
      setHpBadge(event.defenderId, event.hpBefore);
    } else {
      setHpBadge(event.defenderId, event.hpAfter);
    }
    damageBox.remove();
  }

  async function animateInstantDamageEvent(event) {
    const layer = getFxLayer();
    const sourceZone = getZoneByPlayerId(event.sourcePlayerId);
    const hpBadge = getHpBadgeByPlayerId(event.targetPlayerId);
    if (!sourceZone || !hpBadge) return;

    const sourceRect = sourceZone.getBoundingClientRect();
    const hpRect = hpBadge.getBoundingClientRect();

    setHpBadge(event.targetPlayerId, event.hpBefore);

    const box = createFxBox(`瞬伤 ${event.amount}`, 'instantBox');
    layer.appendChild(box);
    placeNodeAtCenter(box, sourceRect);

    await moveNodeTo(box, hpRect, 320);
    setHpBadge(event.targetPlayerId, event.hpAfter);
    await sleep(120);
    box.remove();
  }

  function queueEffectAnimation(event) {
    state.animationChain = state.animationChain.then(async () => {
      if (event.type === 'heal') {
        await animateHealEvent(event);
        return;
      }
      if (event.type === 'damage_resolution') {
        await animateDamageEvent(event);
        return;
      }
      if (event.type === 'instant_damage') {
        await animateInstantDamageEvent(event);
      }
    }).catch(() => {});
  }

  function processEffectEvents(game, shouldAnimate) {
    const events = game.effectEvents || [];
    if (!events.length) return;

    if (!shouldAnimate) {
      state.lastProcessedEffectId = events[events.length - 1].id;
      return;
    }

    events.forEach((ev) => {
      if (ev.id > state.lastProcessedEffectId) {
        queueEffectAnimation(ev);
        state.lastProcessedEffectId = ev.id;
      }
    });
  }

  Object.assign(GPP, {
    processEffectEvents,
  });
})();
