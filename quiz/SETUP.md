# Sphinx quiz — setup for Teresa

Firebase project: **amne151-sphinx**  
Web config is in `quiz/firebase-config.js` (SDK **13.1.0**).

## Console steps

### A. Anonymous Authentication (already done if students can open rooms)

1. Console → **amne151-sphinx**
2. **Build → Authentication → Sign-in method**
3. **Anonymous → Enable → Save**

### B. Publish Realtime Database rules — **required again for leaderboard**

Live smoke (2026-10-28) against the currently published rules:

| Path / shape | Result |
|---|---|
| Open room + Anonymous auth | OK |
| Short / MC (`choiceStr`) / cloud (`words`) answers | OK |
| `rooms/$room/players/$uid` nicknames | **PERMISSION_DENIED** |
| Host **End & wipe** (deletes whole room) | OK |

Until you republish, students cannot join with a nickname and the leaderboard stays empty.

1. **Build → Realtime Database → Rules**
2. Replace the editor with the **full** JSON in `quiz/database.rules.json` (also pasted below)
3. **Publish**

What the new rules add vs a short-answer-only ruleset:

- `players/$uid` — each student writes only their own `{ nick, joinedAt }` (nick ≤ 20 chars)
- `meta.questionOpenedAt` / `meta.openedByQ` — host records open time per question (speed bonus)
- Answer `kind`: `short` / `type` / `open` / `mc` / `cloud`
- MC uses string `choiceStr` (e.g. `"0,2"`); cloud uses `words/{0..4}/{raw,norm}`
- Room delete by host removes **answers and players**

### Full rules (paste into Firebase → Rules)

Prefer copying from `quiz/database.rules.json` (same content):

```json
{
  "rules": {
    "rooms": {
      "$room": {
        ".read": true,
        ".write": "auth != null && !newData.exists() && data.child('meta').child('hostUid').val() === auth.uid",
        "meta": {
          ".write": "auth != null && ((!data.exists() && newData.child('hostUid').val() === auth.uid) || (data.exists() && data.child('hostUid').val() === auth.uid))",
          ".validate": "newData.hasChildren(['hostUid', 'hostToken', 'quizId', 'currentQ', 'revealed', 'createdAt']) && newData.child('hostUid').val() === auth.uid && newData.child('hostToken').isString() && newData.child('hostToken').val().length >= 16 && newData.child('hostToken').val().length <= 128 && newData.child('quizId').isString() && newData.child('quizId').val().length <= 80 && newData.child('currentQ').isNumber() && newData.child('currentQ').val() >= 0 && newData.child('currentQ').val() <= 100 && newData.child('revealed').isBoolean() && newData.child('createdAt').isNumber()",
          "hostUid": {
            ".validate": "newData.isString() && newData.val() === auth.uid"
          },
          "hostToken": {
            ".validate": "newData.isString() && newData.val().length >= 16 && newData.val().length <= 128"
          },
          "quizId": {
            ".validate": "newData.isString() && newData.val().matches(/^[a-zA-Z0-9._-]{1,80}$/)"
          },
          "title": {
            ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 120)"
          },
          "phase": {
            ".validate": "!newData.exists() || (newData.isString() && newData.val().matches(/^(lobby|question|reveal|ended)$/))"
          },
          "ended": {
            ".validate": "!newData.exists() || newData.isBoolean()"
          },
          "questionOpenedAt": {
            ".validate": "!newData.exists() || newData.isNumber()"
          },
          "openedByQ": {
            "$q": {
              ".validate": "newData.isNumber()"
            }
          }
        },
        "players": {
          "$uid": {
            ".write": "auth != null && $uid === auth.uid && root.child('rooms').child($room).child('meta').child('ended').val() != true",
            ".validate": "newData.hasChildren(['nick', 'joinedAt']) && newData.child('nick').isString() && newData.child('nick').val().length > 0 && newData.child('nick').val().length <= 20 && newData.child('joinedAt').isNumber()"
          }
        },
        "answers": {
          "$q": {
            "$uid": {
              ".write": "auth != null && $uid === auth.uid && root.child('rooms').child($room).child('meta').child('ended').val() != true",
              ".validate": "newData.hasChild('kind') && newData.hasChild('at') && newData.child('at').isNumber() && newData.child('kind').isString() && ( ( (newData.child('kind').val() === 'short' || newData.child('kind').val() === 'type' || newData.child('kind').val() === 'open') && newData.hasChild('raw') && newData.hasChild('norm') && newData.child('raw').isString() && newData.child('raw').val().length > 0 && newData.child('raw').val().length <= 280 && newData.child('norm').isString() && newData.child('norm').val().length > 0 && newData.child('norm').val().length <= 280 ) || ( newData.child('kind').val() === 'mc' && newData.hasChild('choiceStr') && newData.child('choiceStr').isString() && newData.child('choiceStr').val().matches(/^[0-9]+(,[0-9]+){0,19}$/) && newData.child('choiceStr').val().length <= 80 ) || ( newData.child('kind').val() === 'cloud' && newData.hasChild('words') ) )",
              "words": {
                "$i": {
                  ".validate": "$i.matches(/^[0-4]$/) && newData.hasChildren(['raw','norm']) && newData.child('raw').isString() && newData.child('raw').val().length > 0 && newData.child('raw').val().length <= 40 && newData.child('norm').isString() && newData.child('norm').val().length > 0 && newData.child('norm').val().length <= 40"
                }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## Modes

| Mode | URL |
|------|-----|
| Self-quiz | `…/quiz/self.html?quiz=lecture-review-1` |
| Presenter | `…/quiz/host.html` |
| Student | QR / `…/quiz/play.html?room=XXXX` |

### Live leaderboard (Kahoot-style)

- On join, students enter a **nickname** (not a real name; max 20 chars; light profanity filter; duplicates get ` 2`, ` 3`, …).
- Nicknames live at `rooms/$room/players/$uid` (each uid writes only itself).
- **Scores are computed on the host** from answers + `at` timestamps vs `meta.questionOpenedAt` — phones never report their own score; they mirror the same math for “your score / rank”.
- Gradable only: **short** and **mc** (single/multi). Open and cloud are not scored.
- Correct = **1000** base; speed bonus up to **+500** scaled by time left in a ~20s window after the question opened.
- MC multi: full points for the exact set; optional partial = (correct options hit) / (number of correct options).
- After **Reveal**, presenter can show **Leaderboard** (top 5). On the last question reveal, **final podium** (1–2–3).
- Each phone shows its own score and rank continuously.
- **End & wipe** deletes the whole room (answers **and** players).

### Self-quiz

Personal score only (“You got X of Y scored questions right”). No shared leaderboard, nothing stored on Firebase.

---

## Question JSON types

Shared file: `quiz/quizzes/<id>.json`.

### Short answer (`short`, legacy alias `type`)

```json
{
  "id": "h1",
  "section": "Heroes",
  "type": "short",
  "prompt": "Whose punishment was being tied to a wheel for eternity?",
  "accepted": ["Ixion"],
  "revealNote": null
}
```

Matching: case/accents/punctuation/articles; Greek folds; edit distance; accepts an answer token inside a longer phrase.

### Open-ended (`open`)

Live: answer **cards** (not a cloud). Self: model answer after continue. **Not scored.**

### Multiple choice (`mc`)

```json
{
  "type": "mc",
  "multi": false,
  "prompt": "Which goddess did Paris choose?",
  "options": ["Hera", "Athena", "Aphrodite"],
  "correct": [2]
}
```

`multi: true` → multi-tap; `correct` is the exact set of indices.

### Word cloud (`cloud`)

Up to `max` (default 3) short words. Live frequency cloud. **Not scored.**

---

## Adding a quiz

1. Add `quiz/quizzes/my-quiz.json`
2. Self: `self.html?quiz=my-quiz`
3. Host: add `<option value="my-quiz">…</option>` in `host.html`

## Privacy

No real names required; nicknames only. Self-quiz stores nothing on a server. Live data wiped with **End & wipe**.

## Dev checks (local)

```bash
cd quiz && node test-normalize.mjs && node test-self.mjs
# After rules republish: node test-live.mjs && node test-answers-rules.mjs
```
