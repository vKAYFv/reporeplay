FROM grafana/k6:1.2.0
USER root
COPY --chmod=755 load-test/scripts/run.sh /run.sh
COPY load-test /load-test
USER 12345
ENTRYPOINT ["/run.sh"]
