// rhythm/init.js — 리듬 공용 상태(G) 초기화
// 출처: reference/ra/init.js — index 정리: 판정(judge.js)·가이드 막대(hud.js)·세션이 쓰는 상태만 남김
//   비트 시계 값(BPM / BEAT_SEC / startTime)은 rhythm/conductor.js가 시작 시 설정
window.G = {};
(function(){
'use strict';
var G = window.G;

G.W = 1280; G.H = 960;   // 가이드 막대 논리 좌표 (hud.js)

// ── 비트 시계 (conductor.js가 설정) ──
G.BPM = 100;
G.BEAT_SEC = 60 / G.BPM;
G.startTime = 0; G.currentBeat = 0;

// ── 판정 대상 (세션이 설정 — hud.js는 patternAt으로 현재 단위 패턴을 그림) ──
G.noteTargetObj = null;

// ── 입력 표시: 플레이어의 실제 입력 기록 (NPC 막대 위 작은 원 — hud.js) ──
// 입력 하나당 표시 하나 { abs: 절대 칸(소수 — 입력 시각 그대로), type, res: 판정 결과 }
//   칸 배열이 아니라 시각 위치라 간격이 좁은 입력도 겹치지 않고, 이르다/늦다가 위치로 보인다
//   절대 위치라 단위·줄 경계를 넘어도 이어진다 (줄 머리 구간에 함께 표시 — hud.js)
// 단위 길이 = 패턴 길이 (세션 두 줄 패턴 = 32, 기본 16)
G.noteInputLen = 16;
G.noteInputMarks = [];
G.noteSlotResults = {};   // index: 칸 결과 (절대 칸 → 'hit' | 'miss') — 가이드 막대 채우기 톤 (judge.js 기록, session.js 정리)
G.noteInputHolding = false;
G.noteInputLastMeasure = -1;

// ── 대리조작 (AUTO, N키) ──
G.noteAutoplay = false;

// ── Beat functions ──
G.beatToTime = function(b) { return G.startTime + b * G.BEAT_SEC; };
G.timeToBeat = function(t) { return (t - G.startTime) / G.BEAT_SEC; };

})();
