from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model that (de)serializes camelCase over the wire, matching the frontend's TypeScript types."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
