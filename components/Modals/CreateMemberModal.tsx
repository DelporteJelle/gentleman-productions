import React, { useState, useEffect } from "react";
import {
  Modal,
  Button,
  TextInput,
  Textarea,
  Group,
  Select,
  LoadingOverlay,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { TeamMember } from "@/types";

interface CreateMemberModalProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (values: TeamMember) => Promise<void>;
  initialData?: TeamMember;
}

const CreateMemberModal: React.FC<CreateMemberModalProps> = ({
  opened,
  onClose,
  onSubmit,
  initialData,
}) => {
  const [loading, setLoading] = useState(false);
  const isEditing = !!initialData;

  const form = useForm({
    initialValues: {
      member_name: "",
      member_role: "",
      email: "",
      image: "",
      linkedin: "",
      instagram: "",
      facebook: "",
      twitter: "",
      website: "",
    },

    validate: {
      member_name: (value) =>
        value.trim().length > 0 ? null : "Name is required",
      member_role: (value) =>
        value.trim().length > 0 ? null : "Role is required",
      email: (value) =>
        value && !/^\S+@\S+$/.test(value) ? "Invalid email address" : null,
    },
  });

  useEffect(() => {
    if (opened) {
      if (initialData) {
        form.setValues({
          member_name: initialData.member_name,
          member_role: initialData.member_role,
          email: initialData.email ?? "",
          image: initialData.image ?? "",
          linkedin: initialData.linkedin ?? "",
          instagram: initialData.instagram ?? "",
          facebook: initialData.facebook ?? "",
          twitter: initialData.twitter ?? "",
          website: initialData.website ?? "",
        });
      } else {
        form.reset();
      }
    }
  }, [opened, initialData]);

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true);
    try {
      await onSubmit({
        ...values,
        uuid: initialData?.uuid ?? crypto.randomUUID(),
        created_at: initialData?.created_at ?? new Date().toDateString(),
      });
      form.reset();
      onClose();
    } catch (error) {
      console.error("Error saving team member:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEditing ? "Edit Team Member" : "Create Team Member"}
      centered
    >
      <LoadingOverlay visible={loading} />
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <TextInput
          label="Name"
          placeholder="Enter member name"
          {...form.getInputProps("member_name")}
          required
        />
        <TextInput
          label="Role"
          placeholder="Enter member role"
          {...form.getInputProps("member_role")}
          required
        />
        <TextInput
          label="Email"
          placeholder="Enter email address"
          {...form.getInputProps("email")}
        />
        <TextInput
          label="Image URL"
          placeholder="Enter image URL"
          {...form.getInputProps("image")}
        />
        <TextInput
          label="LinkedIn"
          placeholder="Enter LinkedIn profile URL"
          {...form.getInputProps("linkedin")}
        />
        <TextInput
          label="Instagram"
          placeholder="Enter Instagram profile URL"
          {...form.getInputProps("instagram")}
        />
        <TextInput
          label="Facebook"
          placeholder="Enter Facebook profile URL"
          {...form.getInputProps("facebook")}
        />
        <TextInput
          label="Twitter"
          placeholder="Enter Twitter profile URL"
          {...form.getInputProps("twitter")}
        />
        <TextInput
          label="Website"
          placeholder="Enter website URL"
          {...form.getInputProps("website")}
        />
        <Group mt="md">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" type="submit">
            {isEditing ? "Save" : "Create"}
          </Button>
        </Group>
      </form>
    </Modal>
  );
};

export default CreateMemberModal;
