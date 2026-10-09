# Log retention

**Thirty days.** Every request to Ricambi is logged with the address it came from, and an IP
address is personal data, so the log is kept for as long as it is useful for finding a fault
and no longer. The period was decided for issue #9; changing it means changing it here, on the
server, and in the records under [`docs/data-protection`](../data-protection/README.md).

**The server enforces this, not the application.** Ricambi writes its log to standard output
and keeps no log file of its own, so there is nothing for it to delete. Nothing in this
repository can make the period true or check that it is: this file is the procedure, and the
last section is how to see that it worked.

It applies to the real deployment ([ADR 0009](../adr/0009-deployment.md)). A preview holds no
member's data, but its visitors have addresses too — do the same there if it is yours to run.

## Why the journal, and not Docker's own log files

Docker's default `json-file` driver rotates by **size** only. It can be told to keep three
files of ten megabytes; it cannot be told to keep thirty days, and on a quiet members' site ten
megabytes is most of a year. The system journal deletes by **age**, which is the rule that was
actually decided.

## Setting it up

1. **Send every container's log to the journal.** In `/etc/docker/daemon.json`:

   ```json
   {
     "log-driver": "journald"
   }
   ```

   Then `sudo systemctl restart docker`. The driver is fixed when a container is created, so
   **recreate** the containers — `docker compose up -d --force-recreate` — rather than
   restarting them. This covers the application, Postgres and Caddy alike.

2. **Tell the journal to keep thirty days.** Create
   `/etc/systemd/journald.conf.d/retention.conf`:

   ```ini
   [Journal]
   MaxRetentionSec=30day
   MaxFileSec=1day
   ```

   Then `sudo systemctl restart systemd-journald`.

   `MaxFileSec` matters as much as the other line. The journal deletes whole files, and only
   once *everything* in a file is past the limit; left at its default of a month per file, the
   oldest line would be nearly sixty days old before it went. A file a day keeps the overshoot
   under a day.

   This is the whole machine's journal, so the same thirty days now applies to what `sshd` and
   the rest of the system log — which also record addresses, and should not outlive this either.

3. **Remove what was written before.** The old `json-file` logs went with the containers that
   were recreated in step 1. Check nothing is left behind:

   ```sh
   sudo find /var/lib/docker/containers -name '*-json.log*'
   ```

4. **If Caddy is asked to keep an access log of its own**, give it the same limit. Caddy logs
   no requests unless a `log` directive says to; if the Caddyfile has one that writes to a
   file, that file is outside the journal and needs its own rule:

   ```
   log {
       output file /var/log/caddy/access.log {
           roll_keep_for 720h
       }
   }
   ```

   Writing to standard output instead needs nothing: it lands in the journal with everything
   else.

5. **Keep the journal out of the backups.** The offsite backup is the database and the stored
   images. A log copied into a backup is a log kept for as long as the backup is.

## Checking it

Straight away:

```sh
# Every container should answer "journald".
docker ps -q | xargs docker inspect -f '{{.Name}} {{.HostConfig.LogConfig.Type}}'

# The application's own lines, arriving in the journal.
journalctl CONTAINER_NAME=<APP_CONTAINER> --since '10 minutes ago' | tail

# The limits as the journal understood them.
systemd-analyze cat-config systemd/journald.conf | grep -E 'MaxRetentionSec|MaxFileSec'
```

After the first month, and whenever the server is rebuilt — this prints nothing when the rule
is holding:

```sh
journalctl --until '32 days ago' | head
```

## When somebody asks for a log line to be kept

A fault under investigation or a suspected break-in is a reason to keep specific lines longer.
Copy those lines out, say why and until when, and delete the copy when the matter is closed.
Raising the limit for everybody is not the way to keep one afternoon's evidence.
