"""AWS gap-check resources: snapshots, AMIs, extended trail/S3/RDS fields, ACM, Lambda, etc.

Revision ID: 0028
Revises: 0027
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("s3_buckets", sa.Column("mfa_delete_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False))

    op.add_column("cloudtrail_trails", sa.Column("s3_bucket_name", sa.String(255), nullable=True))
    op.add_column("cloudtrail_trails", sa.Column("s3_bucket_public", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("cloudtrail_trails", sa.Column("s3_bucket_logging_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("cloudtrail_trails", sa.Column("cloudwatch_logs_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False))

    op.add_column("rds_instances", sa.Column("multi_az", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("rds_instances", sa.Column("deletion_protection", sa.Boolean(), server_default=sa.text("false"), nullable=False))

    op.create_table(
        "ebs_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("snapshot_id", sa.String(64), nullable=False),
        sa.Column("arn", sa.String(512), nullable=False),
        sa.Column("encrypted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_public", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "region", "snapshot_id"),
    )

    op.create_table(
        "ec2_amis",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("image_id", sa.String(64), nullable=False),
        sa.Column("arn", sa.String(512), nullable=False),
        sa.Column("name", sa.String(256), nullable=True),
        sa.Column("is_public", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "region", "image_id"),
    )

    op.create_table(
        "acm_certificates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("certificate_arn", sa.String(512), nullable=False),
        sa.Column("domain_name", sa.String(256), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(40), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "certificate_arn"),
    )

    op.create_table(
        "lambda_functions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("function_name", sa.String(256), nullable=False),
        sa.Column("arn", sa.String(512), nullable=False),
        sa.Column("runtime", sa.String(64), nullable=True),
        sa.Column("has_dlq", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "arn"),
    )

    op.create_table(
        "secrets_manager_secrets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("secret_arn", sa.String(512), nullable=False),
        sa.Column("name", sa.String(512), nullable=False),
        sa.Column("rotation_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "secret_arn"),
    )

    op.create_table(
        "ssm_parameters",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("parameter_name", sa.String(512), nullable=False),
        sa.Column("parameter_type", sa.String(40), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "region", "parameter_name"),
    )

    op.create_table(
        "elb_load_balancers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("load_balancer_arn", sa.String(512), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("lb_type", sa.String(20), nullable=False),
        sa.Column("access_logs_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("ssl_policy", sa.String(128), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "load_balancer_arn"),
    )

    op.create_table(
        "dynamodb_tables",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("table_name", sa.String(256), nullable=False),
        sa.Column("arn", sa.String(512), nullable=False),
        sa.Column("pitr_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("kms_encrypted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "arn"),
    )

    op.create_table(
        "sns_topics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("topic_arn", sa.String(512), nullable=False),
        sa.Column("kms_encrypted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "topic_arn"),
    )

    op.create_table(
        "sqs_queues",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("queue_url", sa.String(512), nullable=False),
        sa.Column("queue_arn", sa.String(512), nullable=False),
        sa.Column("kms_encrypted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "queue_arn"),
    )


def downgrade():
    op.drop_table("sqs_queues")
    op.drop_table("sns_topics")
    op.drop_table("dynamodb_tables")
    op.drop_table("elb_load_balancers")
    op.drop_table("ssm_parameters")
    op.drop_table("secrets_manager_secrets")
    op.drop_table("lambda_functions")
    op.drop_table("acm_certificates")
    op.drop_table("ec2_amis")
    op.drop_table("ebs_snapshots")
    op.drop_column("rds_instances", "deletion_protection")
    op.drop_column("rds_instances", "multi_az")
    op.drop_column("cloudtrail_trails", "cloudwatch_logs_enabled")
    op.drop_column("cloudtrail_trails", "s3_bucket_logging_enabled")
    op.drop_column("cloudtrail_trails", "s3_bucket_public")
    op.drop_column("cloudtrail_trails", "s3_bucket_name")
    op.drop_column("s3_buckets", "mfa_delete_enabled")
