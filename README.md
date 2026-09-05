# PiMesh

**Local agents. Shared intelligence.**

PiMesh is an open-source, Pi-based harness for collaborative algorithm research.
Researchers work from their own Macs while sharing team knowledge, experiment
progress, experiment records, and persistent team memory.

PiMesh 是一个基于 Pi 的算法团队协作 harness。团队成员在各自的 Mac 上
提交代码、分析实验、持续迭代，并共享团队知识、实验进展、实验记录和 memory。

## Status

Project initialization. No runnable implementation is included yet.
The specific Pi integration, technology stack, and storage architecture are still
to be decided.

## Planned capabilities

- Local workflows for code changes, submissions, and iteration.
- Experiment records linking code revisions, configurations, metrics, and artifacts.
- Shared experiment progress and analysis for the whole team.
- Team knowledge and memory with source attribution and reviewable updates.
- Collaboration across developers, agents, and development machines.

## Development

Clone the repository on each development machine:

```sh
git clone https://github.com/jerrymomo10/PiMesh.git
cd PiMesh
git switch -c feat/your-change
```

Commit and push changes on a feature branch, then open a pull request.
Before starting new work, update your local main branch with `git pull --ff-only`.

## Repository hygiene

Keep credentials, private team memory, datasets, and raw experiment artifacts out
of Git. Commit documentation, code, configuration templates, and small synthetic
examples instead. Shared research data storage will be designed separately.

## License

An open-source license has not yet been selected. The repository is public;
licensing is pending.
