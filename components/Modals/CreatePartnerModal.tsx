import React, { useState } from "react";
import {
  Modal,
  Button,
  TextInput,
  Textarea,
  Group,
  LoadingOverlay,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { Partner } from "@/types";

interface CreatePartnerModalProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (values: Partner) => Promise<void>;
}

const CreatePartnerModal: React.FC<CreatePartnerModalProps> = ({
  opened,
  onClose,
  onSubmit,
}) => {
  const [loading, setLoading] = useState(false);

  const form = useForm({
    initialValues: {
      partner_name: "",
      logo: "",
      description: "",
      created_by: "",
    },

    validate: {
      partner_name: (value) =>
        value.trim().length > 0 ? null : "Partner name is required",
      logo: (value) =>
        value.trim().length > 0 ? null : "Logo URL is required",
      description: (value) =>
        value.trim().length > 0 ? null : "Description is required",
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true);
    try {
      await onSubmit({
        ...values,
        uuid: crypto.randomUUID(),
        created_at: new Date().toDateString(),
      });
      form.reset();
      onClose();
    } catch (error) {
      console.error("Error creating partner:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Create Partner" centered>
      <LoadingOverlay visible={loading} />
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <TextInput
          label="Partner Name"
          placeholder="Enter partner name"
          {...form.getInputProps("partner_name")}
          required
        />
        <TextInput
          label="Logo URL"
          placeholder="Enter logo URL"
          {...form.getInputProps("logo")}
          required
        />
        <Textarea
          label="Description"
          placeholder="Enter partner description"
          {...form.getInputProps("description")}
          required
        />
        <TextInput
          label="Created By (Optional)"
          placeholder="Enter creator's UUID"
          {...form.getInputProps("created_by")}
        />
        <Group mt="md">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" type="submit">
            Create
          </Button>
        </Group>
      </form>
    </Modal>
  );
};

export default CreatePartnerModal;
