import os
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

from agents import family_docs


def main() -> None:
    load_dotenv()
    load_dotenv(".env.local", override=True)

    transport = os.environ.get("MCP_TRANSPORT", "stdio")
    mcp = FastMCP("gravity-agents")
    family_docs.register(mcp)
    mcp.run(transport=transport)


if __name__ == "__main__":
    main()
