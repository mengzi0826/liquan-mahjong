const assert = require("assert");

const {
  payCap,
  calcWinRound,
  calcLiujuRound,
} = require("./scorekeeper.js");

function makeSession(players = ["A", "B", "C", "D"], initialScore = 20) {
  return {
    players,
    initialScore,
    rounds: [],
  };
}

function runCase(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    error.message = `[${name}] ${error.message}`;
    throw error;
  }
}

function winParams(overrides = {}) {
  return {
    n: 4,
    session: makeSession(),
    totalsBefore: [20, 20, 20, 20],
    tablePlayers: [0, 1, 2, 3],
    winners: [0],
    winType: "zimo",
    feeder: null,
    winnerFans: [{ winner: 0, fanId: "putong", score: 2 }],
    tianque: [],
    penaltyCounts: [0, 0, 0, 0],
    ting: [0],
    chickenCounts: [0, 0, 0, 0],
    multiplier: 1,
    kongs: [],
    specials: [],
    ...overrides,
  };
}

runCase("payCap caps at zero", () => {
  const bal = [1, 5];
  const paid = payCap(bal, 0, 1, 3);
  assert.strictEqual(paid, 1);
  assert.deepStrictEqual(bal, [0, 6]);
});

runCase("basic zimo fan settlement", () => {
  const scores = calcWinRound(winParams({
    winnerFans: [{ winner: 0, fanId: "qingyise", score: 5 }],
  }));
  assert.deepStrictEqual(scores, [15, -5, -5, -5]);
});

runCase("tianque only settlement", () => {
  const scores = calcWinRound(winParams({
    winnerFans: [{ winner: 0, fanId: "putong", score: 0 }],
    tianque: [0],
  }));
  assert.deepStrictEqual(scores, [6, -2, -2, -2]);
});

runCase("zigang settlement", () => {
  const scores = calcWinRound(winParams({
    winnerFans: [{ winner: 0, fanId: "putong", score: 0 }],
    kongs: [{ konger: 1, type: "zigang" }],
  }));
  assert.deepStrictEqual(scores, [-2, 6, -2, -2]);
});

runCase("fanggang settlement", () => {
  const scores = calcWinRound(winParams({
    winnerFans: [{ winner: 0, fanId: "putong", score: 0 }],
    kongs: [{ konger: 1, type: "fanggang", feeder: 3 }],
  }));
  assert.deepStrictEqual(scores, [0, 2, 0, -2]);
});

runCase("zimo penalty settlement", () => {
  const scores = calcWinRound(winParams({
    penaltyCounts: [0, 1, 2, 3],
  }));
  assert.deepStrictEqual(scores, [12, -3, -4, -5]);
});

runCase("dianpao penalty charges all non-winners", () => {
  const scores = calcWinRound(winParams({
    winners: [2],
    winType: "dianpao",
    feeder: 3,
    winnerFans: [{ winner: 2, fanId: "qidui", score: 5 }],
    penaltyCounts: [3, 0, 0, 1],
    ting: [2],
  }));
  assert.deepStrictEqual(scores, [-3, 0, 9, -6]);
});

runCase("chicken settlement normal mode", () => {
  const scores = calcWinRound(winParams({
    winnerFans: [{ winner: 0, fanId: "putong", score: 0 }],
    winners: [0],
    ting: [0, 2],
    chickenCounts: [2, 0, 1, 0],
    multiplier: 1,
  }));
  assert.deepStrictEqual(scores, [5, -3, 1, -3]);
});

runCase("chicken settlement golden mode", () => {
  const scores = calcWinRound(winParams({
    winnerFans: [{ winner: 0, fanId: "putong", score: 0 }],
    winners: [0],
    ting: [0],
    chickenCounts: [1, 0, 0, 0],
    multiplier: 2,
  }));
  assert.deepStrictEqual(scores, [6, -2, -2, -2]);
});

runCase("special settlement transfers custom score", () => {
  const scores = calcWinRound(winParams({
    winnerFans: [{ winner: 0, fanId: "putong", score: 0 }],
    specials: [{ from: 3, to: 1, amount: 4 }],
  }));
  assert.deepStrictEqual(scores, [0, 4, 0, -4]);
});

runCase("special settlement caps at payer zero", () => {
  const scores = calcWinRound(winParams({
    winnerFans: [{ winner: 0, fanId: "putong", score: 0 }],
    totalsBefore: [20, 1, 20, 20],
    specials: [{ from: 1, to: 2, amount: 4 }],
  }));
  assert.deepStrictEqual(scores, [0, -1, 1, 0]);
});

runCase("settlement order respects tianque before later items", () => {
  const scores = calcWinRound(winParams({
    totalsBefore: [20, 1, 20, 20],
    winners: [2],
    winType: "dianpao",
    feeder: 1,
    winnerFans: [{ winner: 2, fanId: "putong", score: 2 }],
    tianque: [0],
    penaltyCounts: [0, 0, 0, 0],
    ting: [2],
    chickenCounts: [1, 0, 0, 0],
    multiplier: 1,
  }));
  assert.deepStrictEqual(scores, [5, -1, -2, -2]);
});

runCase("others continue settling after one player hits zero", () => {
  const scores = calcWinRound(winParams({
    totalsBefore: [1, 20, 20, 20],
    winners: [2],
    winnerFans: [{ winner: 2, fanId: "qingyise", score: 5 }],
    ting: [2],
    kongs: [{ konger: 1, type: "zigang" }],
  }));
  assert.deepStrictEqual(scores, [-1, 0, 8, -7]);
});

runCase("multiple winners on dianpao split by per-winner fan", () => {
  const scores = calcWinRound(winParams({
    winners: [0, 2],
    winType: "dianpao",
    feeder: 3,
    winnerFans: [
      { winner: 0, fanId: "putong", score: 2 },
      { winner: 2, fanId: "qidui", score: 5 },
    ],
    ting: [0, 2],
  }));
  assert.deepStrictEqual(scores, [2, 0, 5, -7]);
});

runCase("unseated players remain unchanged in 6-player win round", () => {
  const session = makeSession(["A", "B", "C", "D", "E", "F"]);
  const scores = calcWinRound({
    n: 6,
    session,
    totalsBefore: [20, 20, 20, 20, 20, 20],
    tablePlayers: [0, 1, 2, 3],
    winners: [0],
    winType: "zimo",
    feeder: null,
    winnerFans: [{ winner: 0, fanId: "putong", score: 2 }],
    tianque: [],
    penaltyCounts: [0, 0, 0, 0, 0, 0],
    ting: [0],
    chickenCounts: [0, 0, 0, 0, 0, 0],
    multiplier: 1,
    kongs: [],
    specials: [],
  });
  assert.deepStrictEqual(scores, [6, -2, -2, -2, 0, 0]);
});

runCase("basic liuju ting settlement", () => {
  const session = makeSession();
  const scores = calcLiujuRound(4, session, [20, 20, 20, 20], [0, 2], [0, 1, 2, 3], [], []);
  assert.deepStrictEqual(scores, [4, -4, 4, -4]);
});

runCase("liuju with kong and special settlement", () => {
  const session = makeSession();
  const scores = calcLiujuRound(
    4,
    session,
    [20, 20, 20, 20],
    [0],
    [0, 1, 2, 3],
    [{ konger: 1, type: "fanggang", feeder: 2 }],
    [{ from: 3, to: 0, amount: 4 }]
  );
  assert.deepStrictEqual(scores, [10, 0, -4, -6]);
});

runCase("liuju unseated players remain unchanged in 6-player table", () => {
  const session = makeSession(["A", "B", "C", "D", "E", "F"]);
  const scores = calcLiujuRound(
    6,
    session,
    [20, 20, 20, 20, 20, 20],
    [1, 3],
    [0, 1, 2, 3],
    [],
    []
  );
  assert.deepStrictEqual(scores, [-4, 4, -4, 4, 0, 0]);
});

console.log("All scorekeeper tests passed");
