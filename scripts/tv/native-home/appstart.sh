set -u
printf 'ZENO_HOME_INSPECT_BEGIN\n'
/usr/bin/app_launcher -s __TARGET_APP__ 2>&1
printf 'ZENO_HOME_INSPECT_END\n'
