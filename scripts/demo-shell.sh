#!/usr/bin/env bash
# PROTOTYPE: canned shell output for screenshots.
g=$'\033[32m'; d=$'\033[2m'; b=$'\033[1m'; r=$'\033[0m'; y=$'\033[33m'
printf '%s$%s git status -s\n %sM%s src/math.js\n%s??%s src/median.js\n' "$b" "$r" "$y" "$r" "$y" "$r"
printf '%s$%s node --test\n' "$b" "$r"
printf '%s✔%s sum %s(0.41ms)%s\n%s✔%s average %s(0.12ms)%s\n%s✔%s average of an empty list %s(0.08ms)%s\n' "$g" "$r" "$d" "$r" "$g" "$r" "$d" "$r" "$g" "$r" "$d" "$r"
printf '%sℹ tests 3  ℹ pass 3  ℹ fail 0%s\n' "$d" "$r"
