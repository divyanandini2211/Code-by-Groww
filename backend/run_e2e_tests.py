import httpx
import json
import asyncio

BASE_URL = "http://127.0.0.1:8000"

async def run_e2e_tests():
    report = {}
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=15.0) as client:
        # 1. Health
        print("Testing 1: Root Health Check...")
        r = await client.get("/")
        report["1_root_health"] = {
            "endpoint": "GET /",
            "status_code": r.status_code,
            "response": r.json()
        }

        # 2. Market Status
        print("Testing 2: Market Status...")
        r = await client.get("/api/v1/market/status")
        report["2_market_status"] = {
            "endpoint": "GET /api/v1/market/status",
            "status_code": r.status_code,
            "response": r.json()
        }

        # 3. Market Stocks List
        print("Testing 3: List Market Stocks...")
        r = await client.get("/api/v1/market/stocks")
        stocks = r.json()
        report["3_market_stocks"] = {
            "endpoint": "GET /api/v1/market/stocks",
            "status_code": r.status_code,
            "total_stocks_returned": len(stocks),
            "sample_stocks": stocks[:4]
        }

        # 4. Stock Candle History (RELIANCE)
        print("Testing 4: Stock Candle History (RELIANCE)...")
        r = await client.get("/api/v1/market/stocks/RELIANCE/history?limit=5")
        report["4_stock_history"] = {
            "endpoint": "GET /api/v1/market/stocks/RELIANCE/history?limit=5",
            "status_code": r.status_code,
            "candles_sample": r.json()
        }

        # 5. List Watchlists
        print("Testing 5: List Watchlists...")
        r = await client.get("/api/v1/watchlists/")
        watchlists = r.json()
        report["5_list_watchlists"] = {
            "endpoint": "GET /api/v1/watchlists/",
            "status_code": r.status_code,
            "watchlists": watchlists
        }

        # 6. Create a New Custom Watchlist
        print("Testing 6: Create Custom Watchlist...")
        new_w_payload = {
            "name": "My Tech Alpha",
            "description": "High momentum tech & financial stocks"
        }
        r = await client.post("/api/v1/watchlists/", json=new_w_payload)
        created_watchlist = r.json()
        created_w_id = created_watchlist["id"]
        report["6_create_watchlist"] = {
            "endpoint": "POST /api/v1/watchlists/",
            "status_code": r.status_code,
            "input_payload": new_w_payload,
            "response": created_watchlist
        }

        # 7. Add Stock to Watchlist
        print("Testing 7: Add Stock (TCS & PAYTM) to Custom Watchlist...")
        add_tcs = await client.post(f"/api/v1/watchlists/{created_w_id}/stocks", json={"symbol": "TCS"})
        add_paytm = await client.post(f"/api/v1/watchlists/{created_w_id}/stocks", json={"symbol": "PAYTM"})
        report["7_add_stocks_to_watchlist"] = {
            "endpoint": f"POST /api/v1/watchlists/{created_w_id}/stocks",
            "added_tcs_response": add_tcs.json(),
            "added_paytm_response": add_paytm.json()
        }

        # 8. Get Watchlist Details
        print("Testing 8: Get Watchlist Details...")
        r = await client.get(f"/api/v1/watchlists/{created_w_id}")
        report["8_get_watchlist_details"] = {
            "endpoint": f"GET /api/v1/watchlists/{created_w_id}",
            "status_code": r.status_code,
            "response": r.json()
        }

        # 9. Save User Checkpoint (Last Seen)
        print("Testing 9: User Session Checkpoint...")
        r = await client.post("/api/v1/watchlists/checkpoint?user_id=divya_test")
        report["9_save_checkpoint"] = {
            "endpoint": "POST /api/v1/watchlists/checkpoint?user_id=divya_test",
            "status_code": r.status_code,
            "response": r.json()
        }

        # 10. Core Intelligence & "What Changed" on Flagship 30
        flagship_id = next((w["id"] for w in watchlists if "Flagship" in w["name"]), created_w_id)
        print(f"Testing 10: Intelligence Engine on Watchlist {flagship_id} (Simulating 60 mins away)...")
        r = await client.get(f"/api/v1/watchlists/{flagship_id}/intelligence?since_minutes_ago=60")
        report["10_ai_intelligence"] = {
            "endpoint": f"GET /api/v1/watchlists/{flagship_id}/intelligence?since_minutes_ago=60",
            "status_code": r.status_code,
            "response": r.json()
        }

        # 11. Replay Simulation Seek Control
        print("Testing 11: Replay Simulation Seek Control...")
        r = await client.post("/api/v1/market/replay/seek?index=150")
        report["11_replay_seek"] = {
            "endpoint": "POST /api/v1/market/replay/seek?index=150",
            "status_code": r.status_code,
            "response": r.json()
        }

    with open("backend/e2e_test_report.json", "w") as f:
        json.dump(report, f, indent=2)
    print("\n[OK] All 11 End-to-End Tests Executed Successfully! Results saved to backend/e2e_test_report.json")

if __name__ == "__main__":
    asyncio.run(run_e2e_tests())
