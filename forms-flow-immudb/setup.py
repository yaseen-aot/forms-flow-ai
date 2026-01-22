"""Setup script for forms-flow-immudb worker service."""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="forms-flow-immudb",
    version="1.0.0",
    author="",
    description="ImmuDB audit logging and reporting worker service for Forms Flow",
    long_description=long_description,
    long_description_content_type="text/markdown",
    package_dir={"": "src"},
    packages=find_packages(where="src"),
    python_requires=">=3.9",
    install_requires=[
        "Flask>=3.0.0",
        "flask-cors>=4.0.0",
        "python-dotenv>=1.0.0",
        "immudb-py>=1.5.0",
        "requests>=2.31.0",
        "gunicorn>=21.2.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-cov>=4.1.0",
            "black>=23.12.0",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
)
