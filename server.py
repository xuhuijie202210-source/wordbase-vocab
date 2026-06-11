from __future__ import annotations

import json
import os
import sqlite3
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "wordbase.sqlite3"
DATABASE_URL = os.environ.get("DATABASE_URL", "")
IS_POSTGRES = bool(DATABASE_URL)


def db():
    if IS_POSTGRES:
        import psycopg
        from psycopg.rows import dict_row

        return psycopg.connect(DATABASE_URL, row_factory=dict_row)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def sql(statement: str) -> str:
    if IS_POSTGRES:
        return statement.replace("?", "%s")
    return statement


def execute(conn, statement: str, params: tuple = ()):
    return conn.execute(sql(statement), params)


def executemany(conn, statement: str, params: list[tuple]):
    return conn.executemany(sql(statement), params)


def init_db() -> None:
    with db() as conn:
        if IS_POSTGRES:
            conn.execute(
                """
                create table if not exists classes (
                  id integer generated always as identity primary key,
                  code text unique not null,
                  name text not null,
                  grade text,
                  created_at timestamptz default now()
                )
                """
            )
        else:
            conn.execute(
                """
                create table if not exists classes (
                  id integer primary key autoincrement,
                  code text unique not null,
                  name text not null,
                  grade text,
                  created_at text default current_timestamp
                )
                """
            )
        conn.execute(
            """
            create table if not exists students (
              id text primary key,
              class_code text not null,
              student_no text not null,
              name text not null,
              created_at text default current_timestamp,
              unique(class_code, student_no)
            )
            """
        )
        conn.execute(
            """
            create table if not exists word_attempts (
              id text primary key,
              class_code text not null,
              student_id text not null,
              student_name text not null,
              student_no text not null,
              word_id text not null,
              term text not null,
              source text,
              selected_meaning text,
              correct_meaning text,
              is_correct integer not null,
              mastery text,
              mode text,
              created_at text default current_timestamp
            )
            """
        )
        executemany(
            conn,
            """
            insert into classes(code, name, grade)
            values (?, ?, ?)
            on conflict(code) do update set name = excluded.name, grade = excluded.grade
            """,
            [
                ("2541", "25届41班", "高一"),
                ("2538", "25届38班", "高一"),
            ],
        )


def read_json(handler: SimpleHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("content-length", "0"))
    if length == 0:
        return {}
    raw = handler.rfile.read(length).decode("utf-8")
    return json.loads(raw or "{}")


def send_json(handler: SimpleHTTPRequestHandler, payload: dict, status: int = 200) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", "application/json; charset=utf-8")
    handler.send_header("cache-control", "no-store")
    handler.send_header("access-control-allow-origin", "*")
    handler.send_header("access-control-allow-methods", "GET, POST, OPTIONS")
    handler.send_header("access-control-allow-headers", "content-type")
    handler.send_header("content-length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


class WordBaseHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        path = unquote(path.split("?", 1)[0].split("#", 1)[0])
        if path == "/":
            path = "/index.html"
        return str((ROOT / path.lstrip("/")).resolve())

    def end_headers(self) -> None:
        self.send_header("access-control-allow-origin", "*")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")
        self.send_header("access-control-allow-headers", "content-type")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.startswith("/api/classes/") and self.path.endswith("/stats"):
            class_code = self.path.split("/")[3]
            return self.class_stats(class_code)
        return super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api/join-class":
            return self.join_class()
        if self.path == "/api/attempts":
            return self.record_attempt()
        send_json(self, {"error": "not found"}, 404)

    def join_class(self) -> None:
        payload = read_json(self)
        class_code = str(payload.get("classCode", "")).strip()
        name = str(payload.get("name", "")).strip()
        student_no = str(payload.get("studentNo", "")).strip()
        if not class_code or not name or not student_no:
            return send_json(self, {"error": "班级码、姓名和学号不能为空"}, 400)

        with db() as conn:
            class_row = execute(conn, "select * from classes where code = ?", (class_code,)).fetchone()
            if not class_row:
                return send_json(self, {"error": "班级码不存在"}, 404)
            student_id = f"{class_code}-{student_no}"
            execute(
                conn,
                """
                insert into students(id, class_code, student_no, name)
                values (?, ?, ?, ?)
                on conflict(class_code, student_no) do update set name = excluded.name
                """,
                (student_id, class_code, student_no, name),
            )

        send_json(
            self,
            {
                "student": {
                    "id": student_id,
                    "classCode": class_code,
                    "className": class_row["name"],
                    "studentNo": student_no,
                    "name": name,
                }
            },
        )

    def record_attempt(self) -> None:
        payload = read_json(self)
        required = ["classCode", "studentId", "studentName", "studentNo", "wordId", "term"]
        if any(not str(payload.get(key, "")).strip() for key in required):
            return send_json(self, {"error": "缺少答题记录字段"}, 400)
        attempt_id = str(payload.get("id") or f"attempt-{int(time.time() * 1000)}")
        with db() as conn:
            execute(
                conn,
                """
                insert or ignore into word_attempts(
                  id, class_code, student_id, student_name, student_no, word_id, term,
                  source, selected_meaning, correct_meaning, is_correct, mastery, mode
                )
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    attempt_id,
                    payload["classCode"],
                    payload["studentId"],
                    payload["studentName"],
                    payload["studentNo"],
                    payload["wordId"],
                    payload["term"],
                    payload.get("source", ""),
                    payload.get("selectedMeaning", ""),
                    payload.get("correctMeaning", ""),
                    1 if payload.get("correct") else 0,
                    payload.get("mastery", ""),
                    payload.get("mode", ""),
                ),
            )
        send_json(self, {"ok": True, "id": attempt_id})

    def class_stats(self, class_code: str) -> None:
        with db() as conn:
            class_row = execute(conn, "select * from classes where code = ?", (class_code,)).fetchone()
            if not class_row:
                return send_json(self, {"error": "班级码不存在"}, 404)
            rows = execute(
                conn,
                """
                select
                  s.id,
                  s.name,
                  s.student_no,
                  count(a.id) as total,
                  coalesce(sum(a.is_correct), 0) as correct
                from students s
                left join word_attempts a on a.student_id = s.id
                where s.class_code = ?
                group by s.id, s.name, s.student_no
                order by cast(s.student_no as integer), s.student_no
                """,
                (class_code,),
            ).fetchall()
            difficult = execute(
                conn,
                """
                select
                  term,
                  source,
                  count(*) as total,
                  sum(case when is_correct = 0 then 1 else 0 end) as wrong,
                  sum(is_correct) as correct
                from word_attempts
                where class_code = ?
                group by word_id, term, source
                having wrong > 0
                order by wrong desc, total desc
                limit 10
                """,
                (class_code,),
            ).fetchall()

        student_rows = []
        for row in rows:
            total = int(row["total"])
            correct = int(row["correct"])
            student_rows.append(
                {
                    "id": row["id"],
                    "name": row["name"],
                    "studentNo": row["student_no"],
                    "total": total,
                    "accuracy": round(correct / total * 100) if total else 0,
                    "note": "实时记录" if total else "尚未练习",
                }
            )
        active = [row for row in student_rows if row["total"] > 0]
        average = round(sum(row["accuracy"] for row in active) / len(active)) if active else 0
        send_json(
            self,
            {
                "class": {"code": class_row["code"], "name": class_row["name"]},
                "averageAccuracy": average,
                "students": student_rows,
                "difficultWords": [
                    {
                        "term": row["term"],
                        "source": row["source"],
                        "wrong": int(row["wrong"]),
                        "accuracy": round(int(row["correct"] or 0) / int(row["total"]) * 100),
                    }
                    for row in difficult
                ],
            },
        )


def main() -> None:
    init_db()
    port = int(os.environ.get("PORT", "4175"))
    host = os.environ.get("HOST", "127.0.0.1")
    server = ThreadingHTTPServer((host, port), WordBaseHandler)
    print(f"WordBase database server: http://{host}:{port}/")
    print("Database: PostgreSQL via DATABASE_URL" if IS_POSTGRES else f"SQLite database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
