#!/usr/bin/env python3
"""Fine-tune on agent runs that custos fully confirmed, with River (river.ai).

Input: verified.jsonl from `bin/pilot river` -- one {"messages": [...], "source", "custos"} per line, only runs whose
every claim custos CONFIRMED against the recording. Datums are built exactly as
riverai-org/river-skills skills/river-client-training/SKILL.md ("Example 1 -- minimal SFT loop") shows:
get_renderer(BASE_MODEL).build_training_example(messages, train_on=TrainOnWhat.LAST_ASSISTANT).to_dict(),
then model.train_step(data, lr, loss_fn="cross_entropy", grad_clip_norm=1.0) inside client.session().

Without RIVER_API_KEY it is a dry run: it renders every datum (tokenizer only, no GPU) and prints what it would train.

  uv venv --python 3.12 integrations/.venv && uv pip install --python integrations/.venv/bin/python river-client
  bin/pilot river && integrations/.venv/bin/python integrations/river_train.py verified.jsonl
"""
import argparse
import json
import os
import sys

from river_client.renderers import TrainOnWhat, get_renderer

BASE_MODEL = os.environ.get("RIVER_BASE_MODEL", "Qwen/Qwen3.6-35B-A3B-FP8")


def load(path):
    rows = []
    with open(path) as f:
        for n, line in enumerate(f, 1):
            if line.strip():
                row = json.loads(line)
                if not row.get("messages") or row["messages"][-1].get("role") != "assistant":
                    sys.exit(f"{path}:{n}: needs messages ending in an assistant turn")
                rows.append(row)
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("data", nargs="?", default="verified.jsonl")
    ap.add_argument("--steps", type=int, default=3, help="passes over the (tiny) dataset")
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--rank", type=int, default=8, help="LoRA rank (River max 32)")
    a = ap.parse_args()

    rows = load(a.data)
    if not rows:
        sys.exit(f"{a.data} has no verified runs. `bin/pilot river` keeps only runs custos fully confirmed "
                 "(run `bin/pilot custos <name> --summary` after a learn); nothing to train on.")

    renderer = get_renderer(BASE_MODEL)
    data = [renderer.build_training_example(r["messages"], train_on=TrainOnWhat.LAST_ASSISTANT).to_dict() for r in rows]
    for r, d in zip(rows, data):
        trained = sum(1 for w in d["weights"] if w > 0)
        print(f"  {r.get('source', '?'):8} custos {r.get('custos', '?'):>7}  {len(d['input_ids'])} tokens, {trained} trained")

    key = os.environ.get("RIVER_API_KEY")
    if not key:
        print(f"\nDRY RUN (no RIVER_API_KEY): would train a rank-{a.rank} LoRA on {BASE_MODEL} for {a.steps} step(s) "
              f"of {len(data)} datum(s), lr={a.lr}, loss_fn=cross_entropy.")
        return

    import river_client as river

    client = river.Client(api_key=key, endpoint=os.environ.get("RIVER_ENDPOINT", "api.river.ai"))
    with client.session(project="pilot", run="custos-verified-sft") as session:
        model = session.create_model(base_model=BASE_MODEL, lora=river.LoraConfig(rank=a.rank))
        for _ in range(a.steps):
            fb, opt = model.train_step(data, lr=a.lr, loss_fn="cross_entropy", grad_clip_norm=1.0)
            print(f"step {model.step}  loss_mean={fb.metrics['loss_mean']:.4f}  grad_norm={opt.metrics.get('grad_norm')}")
        ckpt = model.save_weights("pilot-verified")
        print(f"saved checkpoint: {ckpt}")


if __name__ == "__main__":
    main()
