# service_python/app/configs/socket_setup.py
"""
Frakt Inter-Process Communication (IPC) Resolver.

This utility manages the discovery and negotiation of communication endpoints
between the FastAPI gateway and the high-performance rendering workers. It
implements a cross-platform strategy that optimizes for low-latency Unix
Domain Sockets (UDS) on Linux/Docker while falling back to stable TCP
loopback on Windows environments.
"""


import os
import platform


def get_socket_path():
    """
    Resolves the inter-process communication (IPC) endpoint for the worker.

    This resolver implements a cross-platform strategy to balance performance
    and stability:
    1. Environment Override: Checks 'WORKER_URL' for manual configuration.
    2. Windows (NT): Defaults to TCP (127.0.0.1:8008) to avoid known
       NotImplementedError issues with Windows Asyncio UDS implementations.
    3. Unix/Linux: Defaults to Unix Domain Sockets (UDS) for high-speed,
       low-latency kernel-level communication.

    Returns:
        str: A TCP address (host:port) or a filesystem path to a .sock file.

    Example:
        '127.0.0.1:8008' (Windows)
        '/tmp/sockets/worker.sock' (Linux/Docker)
    """
    # 1. Check if we have an override from Docker/Prod env
    env_path = os.getenv("WORKER_URL")
    if env_path:
        return env_path

    # 2. Fallback based on OS
    if platform.system() == "Windows":
        windows_override = os.getenv("WORKER_SOCKET_PATH")
        return windows_override if windows_override else "127.0.0.1:8008"

    # 3. Default for Linux/Docker Production
    return "/tmp/sockets/worker.sock"
