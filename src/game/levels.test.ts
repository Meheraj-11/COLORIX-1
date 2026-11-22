import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_MAP } from './colors';
import { getAllLevels, TOTAL_LEVEL_COUNT, WORLDS } from './levels';

test('all 8 worlds and 104 playable levels are present with unique titles and valid geometry', () => {
  assert.equal(WORLDS.length, 8);
  assert.equal(TOTAL_LEVEL_COUNT, 104);

  const levels = getAllLevels();
  assert.equal(levels.length, 104);

  const seenNames = new Set<string>();
  const layoutFingerprints = new Set<string>();

  for (let i = 0; i < levels.length; i++) {
    const lvl = levels[i];
    assert.equal(lvl.id, i + 1);
    assert.ok(lvl.worldId >= 1 && lvl.worldId <= 8);
    assert.ok(lvl.name.length > 0, `Level ${lvl.id} missing name`);
    assert.ok(!seenNames.has(lvl.name), `Duplicate level title: ${lvl.name}`);
    seenNames.add(lvl.name);

    // Palette validity
    assert.ok(lvl.palette.length >= 2 && lvl.palette.length <= 8, `Level ${lvl.id} palette size invalid`);
    for (const c of lvl.palette) {
      assert.ok(COLOR_MAP[c], `Invalid color ${c} in level ${lvl.id}`);
    }

    // Spawn & Portal bounds
    assert.ok(lvl.spawn.x >= 20 && lvl.spawn.x < lvl.width - 100, `Level ${lvl.id} spawn out of bounds`);
    assert.ok(lvl.portal.x > lvl.spawn.x + 300 && lvl.portal.x < lvl.width, `Level ${lvl.id} portal invalid`);

    // Verify spawn sits directly above a solid neutral platform
    const hasSpawnFloor = lvl.platforms.some(
      (p) =>
        p.kind === 'neutral' &&
        lvl.spawn.x >= p.x &&
        lvl.spawn.x <= p.x + p.w &&
        p.y >= lvl.spawn.y &&
        p.y <= lvl.spawn.y + 120,
    );
    assert.ok(hasSpawnFloor, `Level ${lvl.id} spawn has no neutral floor beneath it`);

    // Verify every linked Prism Gate has a matching Color Lock or Light Receptor
    for (const g of lvl.gates) {
      if (g.unlockMode === 'linked') {
        const hasLock = lvl.locks.some((l) => l.targetGateId === g.id);
        const hasRec = lvl.receptors.some((r) => r.targetGateId === g.id);
        assert.ok(hasLock || hasRec, `Level ${lvl.id} linked gate ${g.id} has no trigger`);
      }
    }

    // Verify crystals are inside level bounds
    assert.ok(lvl.crystals.length >= 1, `Level ${lvl.id} should have at least 1 collectible crystal`);
    for (const c of lvl.crystals) {
      assert.ok(c.x > 0 && c.x < lvl.width && c.y > 0 && c.y < lvl.height, `Crystal out of bounds in L${lvl.id}`);
    }

    // Verify monsters exist, use valid palette vulnerability colors, have valid patrol bounds, and never spawn on top of player
    assert.ok(lvl.monsters.length >= 1, `Level ${lvl.id} should have at least 1 patrolling monster`);
    for (const m of lvl.monsters) {
      assert.ok(COLOR_MAP[m.vulnerableColor], `Invalid monster vulnerableColor ${m.vulnerableColor} in L${lvl.id}`);
      assert.ok(lvl.palette.includes(m.vulnerableColor), `Monster ${m.id} color ${m.vulnerableColor} not in L${lvl.id} palette`);
      assert.ok(m.patrolMaxX > m.patrolMinX + 40, `Monster ${m.id} patrol lane too narrow in L${lvl.id}`);
      assert.ok(m.x >= m.patrolMinX && m.x <= m.patrolMaxX, `Monster ${m.id} start x outside patrol in L${lvl.id}`);
      assert.ok(m.speed > 0, `Monster ${m.id} speed invalid in L${lvl.id}`);
      const distToSpawn = Math.hypot(m.x - lvl.spawn.x, m.y - lvl.spawn.y);
      assert.ok(distToSpawn >= 140, `Monster ${m.id} too close to spawn in L${lvl.id} (${distToSpawn})`);
    }

    // Check layout diversity
    const fp = `${lvl.width}:${lvl.platforms.length}:${lvl.movingPlatforms.length}:${lvl.gates.length}:${lvl.locks.length}:${lvl.magneticBlocks.length}:${lvl.emitters.length}:${lvl.palette.join(',')}`;
    layoutFingerprints.add(fp);
  }

  // Ensure rich layout variety across the 104 levels
  assert.ok(layoutFingerprints.size >= 80, `Expected high layout diversity, got ${layoutFingerprints.size}`);
});
