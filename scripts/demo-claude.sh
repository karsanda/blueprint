#!/usr/bin/env bash
# PROTOTYPE: a FAKE Claude-style transcript, used only for screenshots. No Claude is involved.
e() { printf '\033[%sm' "$1"; }
r=$'\033[0m'
printf '%sdemo transcript for screenshots, not a real Claude session%s\n\n' "$(e 2)" "$r"
printf '%s> fix the bug in average and add a test for empty lists%s\n\n' "$(e '1;34')" "$r"
printf '%s●%s Read(src/math.js)\n' "$(e 35)" "$r"
printf '%s●%s Update(src/math.js)\n' "$(e 35)" "$r"
printf '  %s└ Added 3 lines, removed 1 line%s\n' "$(e 2)" "$r"
printf '%s●%s Write(src/median.js)\n' "$(e 35)" "$r"
printf '  %s└ Wrote 6 lines%s\n' "$(e 2)" "$r"
printf '%s●%s Bash(pnpm test)\n\n' "$(e 35)" "$r"
w=41
row() { local t="$1" pad; pad=$((w - 2 - ${#t})); printf '%s│%s %s%s%s%*s %s│%s\n' "$(e 33)" "$r" "$3" "$t" "$r" "$pad" '' "$(e 33)" "$r"; }
printf '%s╭─ Run this command? %s╮%s\n' "$(e 33)" "$(printf '─%.0s' $(seq 1 $((w - 20))))" "$r"
row 'pnpm test'
row '❯ 1. Yes' '' "$(e '1;36')"
row "  2. Yes, and don't ask again"
row '  3. No, tell Claude what to change'
printf '%s╰%s╯%s\n\n' "$(e 33)" "$(printf '─%.0s' $(seq 1 $w))" "$r"
printf '%spalette%s  ' "$(e 2)" "$r"
for i in 0 1 2 3 4 5 6 7; do printf '\033[4%sm   \033[0m' "$i"; done; printf '  '
for i in 0 1 2 3 4 5 6 7; do printf '\033[10%sm   \033[0m' "$i"; done; printf '\n'
printf '%stext   %s red %s green %s yellow %s blue %s magenta %s cyan %s dim %s\n' "$(e 2)" "$(e 31)" "$(e 32)" "$(e 33)" "$(e 34)" "$(e 35)" "$(e 36)" "$(e 2)" "$r"
