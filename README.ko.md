# VSCode Claude Usage

[Claude Code](https://claude.ai/code)의 계정 정보와 토큰 사용량을 VS Code Activity Bar에서 바로 확인할 수 있는 익스텐션입니다.

[English README](README.md)

---

## 주요 기능

- **계정 정보** — 인증 방식, 이메일, 플랜을 Claude API에서 실시간으로 가져옴
- **사용량 프로그레스 바** — Claude Code `/usage` 명령어와 동일한 세션(5시간) · 주간(7일) 사용률과 리셋 시간 표시
- **토큰 통계** — 오늘·이번주 토큰 수, 누적 세션·메시지 수
- **일별 사용량** — 최근 14일간 일별 토큰 내역
- **모델별 누적 통계** — 모델별 입력/출력/전체 토큰 수
- **자동 갱신** — 5분마다, 그리고 사이드바가 열릴 때마다 데이터 자동 조회

## 요구 사항

- [Claude Code CLI](https://claude.ai/code) 설치 및 로그인 완료
- VS Code 1.85 이상
- 플랫폼 지원:
  - **macOS** — macOS Keychain에서 자격증명 읽기
  - **Windows** — Windows Credential Vault에서 자격증명 읽기
  - **Linux** — GNOME Keyring(`secret-tool`) 또는 KWallet(`kwallet-query`)에서 자격증명 읽기

## 사용 방법

Activity Bar의 **✳ 아이콘**을 클릭하면 사용량 패널이 열립니다.

로컬 통계(Daily · By Model 데이터)를 최신화하려면 Claude Code 세션 내에서 `/stats` 명령어를 실행하세요. 파일이 변경되면 익스텐션이 자동으로 반영합니다.

> **Daily 데이터가 오래된 이유**
> Stats · Daily · By Model 데이터는 Claude Code CLI가 관리하는 `~/.claude/stats-cache.json` 파일을 읽습니다. Claude Code에서 `/stats`를 실행하면 최신 데이터로 갱신됩니다.

## 동작 원리

Claude Code가 macOS Keychain(`Claude Code-credentials`)에 저장한 OAuth 자격증명을 읽어 두 가지 Anthropic API 엔드포인트를 호출합니다.

| 엔드포인트 | 데이터 |
|---|---|
| `GET /api/oauth/profile` | 계정 이름, 이메일, 플랜 |
| `GET /api/oauth/usage` | 세션·주간 사용률 % (플랜별 한도는 서버에서 계산) |

로컬 통계는 `~/.claude/stats-cache.json`에서 읽고, 파일 변경 시 자동으로 다시 불러옵니다.

## 개발

```bash
pnpm install
pnpm run watch   # 증분 빌드
```

VS Code에서 **F5**를 눌러 Extension Development Host를 실행합니다.

```bash
pnpm run package   # 빌드 + .vsix 패키지 생성
```

## 라이선스

MIT
