// 데이터 파일 — 편집기가 통째로 다시 쓴다 (tools/dev-server.py /save). 손으로 고쳐도 되지만 주석은 저장 때 사라짐
// 형식·쓰는 곳: docs/index/content.md
window.MoaiData = window.MoaiData || {};
window.MoaiData["missions"] = {
  "field": [
    {
      "condition": {
        "card": "hold",
        "need": {
          "loops": 1
        }
      },
      "reward": "bar"
    },
    {
      "condition": {
        "card": "hold",
        "need": {
          "loops": 1
        }
      },
      "reward": "bgm"
    },
    {
      "condition": {
        "card": "loopClear",
        "need": {
          "points": 1
        },
        "patterns": [
          "quarterTaps"
        ]
      },
      "reward": "none"
    },
    {
      "condition": {
        "card": "loopClear",
        "need": {
          "points": 1
        },
        "patterns": [
          "dooWop"
        ]
      },
      "reward": "none"
    },
    {
      "condition": {
        "card": "loopClear",
        "need": {
          "points": 1
        },
        "patterns": [
          "dooTap"
        ]
      },
      "reward": "none"
    },
    {
      "condition": {
        "card": "loopClear",
        "need": {
          "points": 1
        },
        "patterns": [
          "islandMini1"
        ]
      },
      "reward": "mini"
    },
    {
      "condition": {
        "card": "loopClear",
        "need": {
          "points": 1
        },
        "patterns": [
          "islandMini2"
        ]
      },
      "reward": "mini"
    },
    {
      "condition": {
        "card": "loopClear",
        "need": {
          "points": 1
        },
        "patterns": [
          "islandMini3"
        ]
      },
      "reward": "mini"
    },
    {
      "condition": {
        "card": "loopClear",
        "need": {
          "points": 1
        },
        "patterns": [
          "islandMini4"
        ]
      },
      "reward": "mini"
    },
    {
      "condition": {
        "card": "loopClear",
        "need": {
          "points": 1
        },
        "patterns": [
          "islandMini5"
        ]
      },
      "reward": "mini"
    },
    {
      "condition": {
        "card": "loopClear",
        "need": {
          "points": 1
        },
        "patterns": [
          "islandMini6"
        ]
      },
      "reward": "mini"
    },
    {
      "condition": {
        "card": "loopClear",
        "need": {
          "points": 1
        },
        "patterns": [
          "islandMini7"
        ]
      },
      "reward": "mini"
    },
    {
      "condition": {
        "card": "hold",
        "need": {
          "loops": 1
        }
      },
      "reward": "none",
      "repeat": "untilEmpty"
    }
  ],
  "session": [
    {
      "family": "TAP",
      "stages": [
        [
          "TAP1"
        ],
        [
          "TAP2"
        ],
        [
          "TAP3"
        ]
      ]
    },
    {
      "family": "DOO",
      "stages": [
        [
          "DOO1"
        ],
        [
          "DOO2"
        ],
        [
          "DOO3"
        ]
      ]
    },
    {
      "family": "MIX",
      "stages": [
        [
          "MIX1"
        ],
        [
          "MIX2"
        ],
        [
          "MIX3"
        ]
      ]
    },
    {
      "family": "CPA",
      "stages": [
        [
          "CPA1"
        ],
        [
          "CPA2"
        ],
        [
          "CPA3"
        ]
      ]
    },
    {
      "family": "CPB",
      "stages": [
        [
          "CPB1"
        ],
        [
          "CPB2"
        ],
        [
          "CPB3"
        ]
      ]
    },
    {
      "family": "CPC",
      "stages": [
        [
          "CPC1"
        ],
        [
          "CPC2"
        ],
        [
          "CPC3"
        ]
      ]
    },
    {
      "family": "CPD",
      "stages": [
        [
          "CPD1"
        ],
        [
          "CPD2"
        ],
        [
          "CPD3"
        ]
      ]
    }
  ]
};
