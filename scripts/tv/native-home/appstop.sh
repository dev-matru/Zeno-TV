set -u
printf 'ZENO_HOME_INSPECT_BEGIN\n'
result=$(/usr/bin/app_launcher -t __TARGET_APP__ 2>&1)
printf '%s\n' "$result"
case "$result" in
  *"App isn't running"*) printf 'ZENO_APP_STOPPED\n' ;;
  *"Terminate appId: __TARGET_APP__ ("*)
    stopped_pid=$(printf '%s\n' "$result" | sed -n 's/.*(\([0-9][0-9]*\)).*/\1/p')
    for attempt in 1 2 3 4 5 6 7 8 9 10; do
      if [ -n "$stopped_pid" ] && [ ! -d "/proc/$stopped_pid" ]; then printf 'ZENO_APP_STOPPED\n'; break; fi
      sleep 0.2
    done ;;
esac
printf 'ZENO_HOME_INSPECT_END\n'
