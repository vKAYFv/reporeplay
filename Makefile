.PHONY: build test vet fmt-check check demo clean

build:
	go build -trimpath -o bin/reporeplay ./cmd/reporeplay

test:
	go test -race ./...

vet:
	go vet ./...

fmt-check:
	@test -z "$$(gofmt -l cmd internal)" || (gofmt -l cmd internal && exit 1)

check: fmt-check vet test

demo: build
	./bin/reporeplay build --output reporeplay.html .

clean:
	rm -rf bin coverage.out reporeplay.html
