set -u
printf 'ZENO_HOME_INSPECT_BEGIN\n'
/usr/bin/app_launcher -t __ZENO_SERVICE__ 2>&1
printf 'ZENO_HOME_INSPECT_END\n'
