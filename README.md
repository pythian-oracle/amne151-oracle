# Consult the Oracle: AMNE 151 Final Project idea game

A small web page where students answer the Final Project idea-approval questions one at a time, asked by the Pythia at Delphi. Their answers go into your Google Form, so they land in your response sheet just like normal form responses.

Files: `index.html`, `style.css`, `game.js` (all artwork is drawn in code, so there are no image files). It runs offline and needs no installing.

## 1. Create the form
1. Go to https://script.google.com, then **New project**.
2. Paste in everything from `project-approval-form.gs`, save, and click **Run** (`createApprovalForm`). Approve access when it asks.
3. Open **Execution log**. It shows the student link, the edit link, the tracking sheet, and **a block of text that starts `FORM_ACTION_URL:`**. Copy that block; you'll need it in step 2.

## 2. Connect the game to the form
**Easy way:** open `game.js` in any text editor (Notepad or TextEdit works). At the top is `var CONFIG = { ... }`. Replace the `FORM_ACTION_URL:` line and the `ENTRY: { ... },` block with the ones from the log. Save.

**Manual way (if the log didn't work):**
- *Form ID:* in the form, click **Send**, then the link icon. The link looks like `https://docs.google.com/forms/d/e/LONG_ID/viewform`. Copy it and change `viewform` to `formResponse`. That is your `FORM_ACTION_URL`.
- *Entry IDs:* in the form editor, click **⋮** then **Get pre-filled link**. Type a dummy answer into every question, click **Get link**, then **Copy link**. Paste it somewhere. You'll see parts like `entry.1234567890=dummy`, in the same order as the questions. Put each `entry.NNNN` into the matching line of `ENTRY` (fullName, tutorial, format, idea). Leave `email: 'emailAddress'` as it is.

## Form settings that must be right (or submissions vanish silently)
- **Settings > Responses > "Restrict to users in UBC (and its trusted organizations)": OFF.** The game can't sign students in.
- **Settings > Responses > Collect email addresses: "Responder input".** Do *not* choose "Verified", because that forces Google sign-in and blocks the game. (The script tries to set this for you.)
- Keep the question wording and tutorial choices exactly as the script made them. If you edit a choice in the form, edit it in `game.js` too.

## 3. Test once
Open `index.html` (double-click it), go through the questions with fake answers, and press **Transmit to the oracle**. Then check the response sheet. If no row appears, re-check the entry numbers and the two settings above.
Note: Google doesn't let the page see whether the form accepted the answer, so the game always shows the "success" screen. That's why this test matters. Delete the test row afterwards.
Until CONFIG is filled in, the Transmit button just tells students to use **Copy my answers** and email them to you (tesa@student.ubc.ca) instead.

## 4. Put it online with GitHub Pages
1. Make a free account at https://github.com, then click **New repository**. Give it a name (e.g. `amne151-oracle`), make it **Public**, and create it.
2. Click **uploading an existing file**, drag in `index.html`, `style.css`, `game.js`, and `README.md`, and click **Commit changes**.
3. **Settings > Pages > Build and deployment > Source: Deploy from a branch > Branch: `main`, folder `/ (root)` > Save.**
4. After a minute or two the page shows your address, e.g. `https://yourname.github.io/amne151-oracle/`. Share that link on Canvas. It's worth keeping the plain Google Form link as a backup.

## Changing things later
Wording lives in `game.js` (the `QUESTIONS` list and the `say(...)` lines). Edit, then upload the file to GitHub again.

## Saved progress
Answers are saved automatically in the student's own browser as they type, so if they close the tab they can pick up where they left off (the Pythia offers **Continue** or **Start over**). Nothing is sent anywhere until they press Transmit, and the saved copy is erased after a successful transmission. It only works on the same device and browser.

## Music
Soft lyre-like music is created live by the browser (no audio files). It starts only after a student clicks **Approach the oracle**, pauses when the tab is hidden, and the **Music on/off** button at the top right turns it off (the browser remembers each student's choice). To have it start muted for everyone, open `game.js` and change `MUSIC_DEFAULT_ON: true` to `MUSIC_DEFAULT_ON: false`. `MUSIC_VOLUME` sets the loudness (0.15 is quiet).

## Project Proposal Guide
`info.html` is a separate page with the Project Proposal notes and bibliography how-to. It is linked from the intro screen and the footer. Upload it to GitHub along with the other files.

## Offerings minigame
Click (or Enter) the myrtle, lamb or ox left of the Pythia to offer it: it arcs into the flame, burns, and smoke rises above the temple, with a short Web Audio ritual cue (muted with the music toggle). The Pythia answers with short verbatim quotes from public-domain translations of syllabus works (Butler's Iliad/Odyssey; Evelyn-White's Homeric Hymns and Works and Days). Decorative only; it never touches the form.

`amne151-proposal-due.ics` is the "Add to calendar" file for the proposal due date.

## Syllabus
`syllabus.html` (with `syllabus.js` and `syllabus-ai-meme.jpg`) is the course syllabus transcribed from Dr Minard's 2026 AMNE 151 syllabus PDF, with a contents list, a week-by-week schedule (the next lecture is highlighted by date) and collapsible long policy sections. It opens from the red **Syllabus** chest beside the Treasury in the temple scene, and from the footer. If the PDF changes, edit the matching text in `syllabus.html`.
