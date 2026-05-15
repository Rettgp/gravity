import os
import boto3
from langchain_core.documents import Document


def load_from_s3(bucket: str, prefix: str = "") -> list[Document]:
    """Download all .md files from S3 and return them as LangChain Documents."""
    s3 = boto3.client("s3", region_name=os.environ["AWS_REGION"])
    paginator = s3.get_paginator("list_objects_v2")

    docs: list[Document] = []
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if not key.endswith(".md"):
                continue
            body = s3.get_object(Bucket=bucket, Key=key)["Body"].read().decode("utf-8")
            docs.append(Document(page_content=body, metadata={"source": key}))

    return docs
