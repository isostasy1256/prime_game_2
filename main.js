const tileTypes = [
  "1m","2m","3m","4m","5m","6m","7m","8m","9m",
  "1p","2p","3p","4p","5p","6p","7p","8p","9p",
  "1s","2s","3s","4s","5s","6s","7s","8s","9s",
  "east","south","west","north","white","green","red"
];

const tileFaces = {
  "1m":"🀇","2m":"🀈","3m":"🀉","4m":"🀊","5m":"🀋","6m":"🀌","7m":"🀍","8m":"🀎","9m":"🀏",
  "1p":"🀙","2p":"🀚","3p":"🀛","4p":"🀜","5p":"🀝","6p":"🀞","7p":"🀟","8p":"🀠","9p":"🀡",
  "1s":"🀐","2s":"🀑","3s":"🀒","4s":"🀓","5s":"🀔","6s":"🀕","7s":"🀖","8s":"🀗","9s":"🀘",
  east:"🀀", south:"🀁", west:"🀂", north:"🀃", white:"🀆", green:"🀅", red:"🀄"
};

const winds = ["東", "南", "西", "北"];
const names = ["あなた", "下家", "対面", "上家"];
const redTiles = new Set(["5m", "5p", "5s", "red"]);

let room = localStorage.getItem("mahjongRoom") || "local";
let selectedSeat = Number(localStorage.getItem(`mahjongSeat:${room}`) ?? -1);
const clientId = localStorage.getItem("mahjongClientId") || crypto.randomUUID();
localStorage.setItem("mahjongClientId", clientId);

let state = loadState();
let channel = openChannel(room);
let botTimer = 0;

const screen = {
  roomLabel: document.getElementById("roomLabel"),
  roomInput: document.getElementById("roomInput"),
  joinRoomButton: document.getElementById("joinRoomButton"),
  newGameButton: document.getElementById("newGameButton"),
  wallCount: document.getElementById("wallCount"),
  turnName: document.getElementById("turnName"),
  discardArea: document.getElementById("discardArea"),
  messageLog: document.getElementById("messageLog"),
  seatButtons: document.getElementById("seatButtons"),
  statusText: document.getElementById("statusText"),
  hand: document.getElementById("hand"),
  drawButton: document.getElementById("drawButton"),
  riichiButton: document.getElementById("riichiButton"),
  winButton: document.getElementById("winButton")
};

function openChannel(roomName) {
  const nextChannel = new BroadcastChannel(`mahjong-room:${roomName}`);

  nextChannel.onmessage = (event) => {
    if (!event.data || event.data.clientId === clientId) return;

    if (event.data.type === "state" && event.data.state.version >= state.version) {
      state = event.data.state;
      saveState(false);
      render();
    }
  };

  return nextChannel;
}

function createGame() {
  const wall = [];

  tileTypes.forEach((type) => {
    for (let copy = 0; copy < 4; copy++) {
      wall.push({
        id: `${type}-${copy}-${crypto.randomUUID()}`,
        type
      });
    }
  });

  shuffle(wall);

  const players = Array.from({ length: 4 }, (_, seat) => ({
    seat,
    name: names[seat],
    score: 25000,
    hand: [],
    discards: [],
    riichi: false
  }));

  for (let pass = 0; pass < 13; pass++) {
    for (let seat = 0; seat < 4; seat++) {
      players[seat].hand.push(wall.pop());
    }
  }

  players.forEach((player) => sortHand(player.hand));
  players[0].hand.push(wall.pop());

  return {
    version: Date.now(),
    turn: 0,
    phase: "discard",
    wall,
    players,
    seats: {},
    winner: "",
    log: ["東一局、開局しました。親から打牌してください。"]
  };
}

function loadState() {
  const saved = localStorage.getItem(`mahjongState:${room}`);
  if (!saved) return createGame();

  try {
    const parsed = JSON.parse(saved);
    return parsed.players && parsed.wall ? parsed : createGame();
  } catch {
    return createGame();
  }
}

function saveState(shouldBroadcast = true) {
  state.version = Date.now();
  localStorage.setItem(`mahjongState:${room}`, JSON.stringify(state));

  if (shouldBroadcast) {
    channel.postMessage({
      type: "state",
      clientId,
      state
    });
  }
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
}

function sortHand(hand) {
  hand.sort((a, b) => tileTypes.indexOf(a.type) - tileTypes.indexOf(b.type));
}

function render() {
  screen.roomLabel.textContent = `room: ${room}`;
  screen.roomInput.value = room;
  screen.wallCount.textContent = `山 ${state.wall.length}`;
  screen.turnName.textContent = state.winner || `${state.players[state.turn].name}の番`;

  renderPlayers();
  renderDiscards();
  renderSeatButtons();
  renderHand();
  renderCommands();

  screen.messageLog.innerHTML = state.log
    .slice(-5)
    .map((message) => `<div>${escapeHtml(message)}</div>`)
    .join("");

  runBotIfNeeded();
}

function renderPlayers() {
  state.players.forEach((player) => {
    const playerBox = document.getElementById(`player-${player.seat}`);
    const position = ["bottom", "right", "top", "left"][player.seat];
    const isActive = state.turn === player.seat && !state.winner;
    const isMine = selectedSeat === player.seat;
    const isOccupied = Object.values(state.seats).includes(player.seat);

    playerBox.className = `player player-${position} ${isActive ? "active" : ""} ${isMine ? "mine" : ""}`;
    playerBox.innerHTML = `
      <div class="player-head">
        <span class="player-name">${escapeHtml(player.name)} ${winds[player.seat]}</span>
        <span class="score">${player.score.toLocaleString()}</span>
      </div>
      <div>${player.riichi ? "リーチ" : isOccupied ? "着席中" : "自動"} / 手牌 ${player.hand.length}</div>
      <div class="mini-hand"></div>
    `;

    const miniHand = playerBox.querySelector(".mini-hand");

    player.hand.slice(0, 14).forEach((tile) => {
      miniHand.appendChild(createTile(tile, {
        small: true,
        back: player.seat !== selectedSeat
      }));
    });
  });
}

function renderDiscards() {
  screen.discardArea.innerHTML = "";

  state.players.forEach((player) => {
    const box = document.createElement("div");
    box.className = "discard-box";
    box.innerHTML = `
      <div class="discard-name">${escapeHtml(player.name)}の河</div>
      <div class="discard-tiles"></div>
    `;

    const tiles = box.querySelector(".discard-tiles");

    player.discards.slice(-18).forEach((tile) => {
      tiles.appendChild(createTile(tile, { small: true }));
    });

    screen.discardArea.appendChild(box);
  });
}

function renderSeatButtons() {
  screen.seatButtons.innerHTML = "";

  state.players.forEach((player) => {
    const button = document.createElement("button");
    const owner = Object.entries(state.seats).find(([, seat]) => seat === player.seat)?.[0];
    const isMine = selectedSeat === player.seat;

    button.textContent = isMine ? `${winds[player.seat]} 離席` : `${winds[player.seat]} 着席`;
    button.disabled = Boolean(owner && owner !== clientId);
    button.addEventListener("click", () => toggleSeat(player.seat));

    screen.seatButtons.appendChild(button);
  });
}

function renderHand() {
  screen.hand.innerHTML = "";

  if (selectedSeat < 0) {
    screen.statusText.textContent = "席を選ぶと自分の手牌を操作できます。";
    return;
  }

  const player = state.players[selectedSeat];
  const isMyTurn = selectedSeat === state.turn && !state.winner;

  screen.statusText.textContent = state.winner
    ? state.winner
    : isMyTurn
      ? state.phase === "draw" ? "ツモを押してください。" : "打牌する牌を選んでください。"
      : `${state.players[state.turn].name}の番です。`;

  player.hand.forEach((tile) => {
    screen.hand.appendChild(createTile(tile, {
      onClick: () => {
        if (isMyTurn && state.phase === "discard") {
          discardTile(selectedSeat, tile.id);
        }
      }
    }));
  });
}

function renderCommands() {
  const player = state.players[selectedSeat];
  const isMyTurn = selectedSeat === state.turn && !state.winner;

  screen.drawButton.disabled = !(isMyTurn && state.phase === "draw");
  screen.riichiButton.disabled = !(isMyTurn && player && !player.riichi && player.score >= 1000);
  screen.winButton.disabled = !(isMyTurn && player && canWin(player.hand));
}

function createTile(tile, options = {}) {
  const button = document.createElement("button");

  button.className = [
    "tile",
    options.small ? "small" : "",
    options.back ? "back" : "",
    redTiles.has(tile.type) ? "red" : ""
  ].join(" ");

  button.textContent = options.back ? "■" : tileFaces[tile.type];
  button.title = tile.type;

  if (options.onClick) {
    button.addEventListener("click", () => options.onClick(tile));
  }

  return button;
}

function toggleSeat(seat) {
  if (selectedSeat === seat) {
    delete state.seats[clientId];
    selectedSeat = -1;
  } else {
    delete state.seats[clientId];
    state.seats[clientId] = seat;
    selectedSeat = seat;
  }

  localStorage.setItem(`mahjongSeat:${room}`, String(selectedSeat));
  saveState();
  render();
}

function drawTile(seat) {
  if (state.winner || state.turn !== seat || state.phase !== "draw") return;

  const tile = state.wall.pop();

  if (!tile) {
    finishDraw();
    saveState();
    render();
    return;
  }

  const player = state.players[seat];
  player.hand.push(tile);
  sortHand(player.hand);
  state.phase = "discard";
  state.log.push(`${player.name}がツモりました。`);

  saveState();
  render();
}

function discardTile(seat, tileId) {
  if (state.winner || state.turn !== seat || state.phase !== "discard") return;

  const player = state.players[seat];
  const tileIndex = player.hand.findIndex((tile) => tile.id === tileId);
  if (tileIndex < 0) return;

  const [tile] = player.hand.splice(tileIndex, 1);
  player.discards.push(tile);
  state.log.push(`${player.name} 打 ${tileFaces[tile.type]}`);

  if (state.wall.length === 0) {
    finishDraw();
  } else {
    state.turn = (seat + 1) % 4;
    state.phase = "draw";
  }

  saveState();
  render();
}

function declareRiichi() {
  const player = state.players[selectedSeat];

  if (!player || player.riichi || player.score < 1000) return;

  player.riichi = true;
  player.score -= 1000;
  state.log.push(`${player.name} リーチ`);

  saveState();
  render();
}

function declareWin() {
  const player = state.players[selectedSeat];

  if (!player || !canWin(player.hand)) return;

  const gain = player.riichi ? 8000 : 6000;

  player.score += gain;

  state.players.forEach((other) => {
    if (other.seat !== player.seat) {
      other.score -= Math.floor(gain / 3);
    }
  });

  state.winner = `${player.name}が和了しました。`;
  state.log.push(`${player.name} 和了 +${gain}`);

  saveState();
  render();
}

function finishDraw() {
  state.winner = "流局しました。";
  state.log.push("山が尽きて流局しました。");
}

function runBotIfNeeded() {
  clearTimeout(botTimer);

  if (state.winner) return;
  if (Object.values(state.seats).includes(state.turn)) return;

  botTimer = window.setTimeout(() => {
    if (state.phase === "draw") {
      drawTile(state.turn);
    } else {
      const hand = state.players[state.turn].hand;
      const tile = chooseBotDiscard(hand);
      discardTile(state.turn, tile.id);
    }
  }, 700);
}

function chooseBotDiscard(hand) {
  const counts = countTiles(hand);
  return hand.find((tile) => counts[tile.type] === 1) || hand[Math.floor(Math.random() * hand.length)];
}

function countTiles(hand) {
  return hand.reduce((counts, tile) => {
    counts[tile.type] = (counts[tile.type] || 0) + 1;
    return counts;
  }, {});
}

function canWin(hand) {
  if (hand.length % 3 !== 2) return false;

  const counts = tileTypes.map((type) => hand.filter((tile) => tile.type === type).length);

  if (counts.filter((count) => count === 2).length === 7) {
    return true;
  }

  for (let index = 0; index < counts.length; index++) {
    if (counts[index] >= 2) {
      counts[index] -= 2;

      if (canMakeSets(counts)) {
        counts[index] += 2;
        return true;
      }

      counts[index] += 2;
    }
  }

  return false;
}

function canMakeSets(counts) {
  const first = counts.findIndex((count) => count > 0);

  if (first === -1) return true;

  if (counts[first] >= 3) {
    counts[first] -= 3;

    if (canMakeSets(counts)) {
      counts[first] += 3;
      return true;
    }

    counts[first] += 3;
  }

  const type = tileTypes[first];
  const suit = type[1];
  const value = Number(type[0]);

  if (Number.isFinite(value) && value <= 7) {
    const second = tileTypes.indexOf(`${value + 1}${suit}`);
    const third = tileTypes.indexOf(`${value + 2}${suit}`);

    if (second >= 0 && third >= 0 && counts[second] > 0 && counts[third] > 0) {
      counts[first]--;
      counts[second]--;
      counts[third]--;

      if (canMakeSets(counts)) {
        counts[first]++;
        counts[second]++;
        counts[third]++;
        return true;
      }

      counts[first]++;
      counts[second]++;
      counts[third]++;
    }
  }

  return false;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

screen.joinRoomButton.addEventListener("click", () => {
  const nextRoom = screen.roomInput.value.trim() || "local";

  channel.close();
  room = nextRoom;
  localStorage.setItem("mahjongRoom", room);
  selectedSeat = Number(localStorage.getItem(`mahjongSeat:${room}`) ?? -1);
  state = loadState();
  channel = openChannel(room);

  render();
});

screen.newGameButton.addEventListener("click", () => {
  const seats = state.seats;
  state = createGame();
  state.seats = seats;
  saveState();
  render();
});

screen.drawButton.addEventListener("click", () => drawTile(selectedSeat));
screen.riichiButton.addEventListener("click", declareRiichi);
screen.winButton.addEventListener("click", declareWin);

saveState(false);
render();
